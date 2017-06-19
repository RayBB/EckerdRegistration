var request = require("request-promise");
var accounts = require("./users.json");
let cheerio = require("cheerio");

function registerForClasses(friend) {
  let user = new Account(friend);
  user.getCookies()
    .then(() => user.login())
    .then(() => user.submitTerm())
    .then(() => user.submitRegistrationCode())
    .then(() => user.prepareCRNs())
    .catch(e => {
      console.log(user.user.username + " Error: \t" + e);
      if (e == "not ready to register yet!") {
        user.submitCRN();
      }
    });
}


class Account {
  constructor(user) {
    this.user = user;
    this.request = request.defaults({
      jar: true,
      followAllRedirects: true,
      timeout: 120000,
      "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36"
    });
    
    this.constructCRNString();
  }

  log(text) {
      console.log(`${this.user.username}: \t ${text}`);
  }

  constructCRNString() {
    this.crnString = "?term_in="+this.user.term+
    "&RSTS_IN=DUMMY&assoc_term_in=DUMMY&CRN_IN=DUMMY&start_date_in=DUMMY&end_date_in=DUMMY&SUBJ=DUMMY" + 
    "&CRSE=DUMMY&SEC=DUMMY&LEVL=DUMMY&CRED=DUMMY&GMOD=DUMMY&TITLE=DUMMY&MESG=DUMMY&REG_BTN=DUMMY&MESG=DUMMY";

    for (var c in this.user.crns) {
      this.crnString += "&RSTS_IN=RW";
      this.crnString += "&CRN_IN=" + this.user.crns[c];
      this.crnString += "&assoc_term_in=&start_date_in=&end_date_in=";
    }

    this.crnString += "&regs_row=0&wait_row=0&add_row=10&REG_BTN=Submit+Changes";
  }

  getCookies() {
    return this.request(
      "https://myecweb.eckerd.edu/pls/prod/twbkwbis.P_WWWLogin"
    );
  }

  login() {
    return this.request
      .post({
        url: "https://myecweb.eckerd.edu/pls/prod/twbkwbis.P_ValLogin",
        form: { sid: this.user.username, PIN: this.user.password }
      })
      .then(b => this.verifyLogin(b))
  }

  verifyLogin(body) {
    if (body.includes("Welcome,")) {
      this.log("Logged in successfully!");
    } else {
      throw "Could not log into " + this.user.username + " successfully...";
    }
  }

  submitTerm() {
    return this.request
      .post("https://myecweb.eckerd.edu/pls/prod/bwskfreg.P_AltPin")
      .form({ term_in: this.user.term })
  }

  submitRegistrationCode() {
    return this.request
      .post("https://myecweb.eckerd.edu/pls/prod/bwskfreg.P_CheckAltPin")
      .form({ pin: this.user.registrationCode })
      .then( b => this.verifyRegistrationCode(b));
  }

  verifyRegistrationCode(body) {
    if (body.includes("Invalid Alternate PIN")) {
      throw "Invalid registration pin";
    } else {
        this.log("Registration code valid!");
    }
  }

  prepareCRNs() {

    let registrationTime = new Date(...this.user.registrationDate);
    let millisTill = registrationTime - new Date();
    
    if (millisTill < 0) {
      this.submitCRNs();
    } else {
      this.log(`Will submit in ${millisTill / 1000} seconds (or ${millisTill/1000/60} minutes)`);
      setTimeout(() => {this.submitCRNs();}, millisTill);
    }
  }

  submitCRNs() {
    let newURL = "https://myecweb.eckerd.edu/pls/prod/bwckcoms.P_Regs"+ this.crnString;
    return this.request
    .post(newURL)
    .then(b => this.verifyCRNs(b));
  }

  verifyCRNs(body) {
    let $ = cheerio.load(body);
    let registered = getRegistered($);
    let notRegistered = getNotRegistered($);


    this.log("Registered for: ")
    registered.forEach((value) => {
      this.log("--" + value);
    })

    console.log(registered);
    console.log(notRegistered);
    this.log("Didn't get into: ");
    notRegistered.forEach((value) => {
      if (!registered.includes(value)){
        this.log("--" + value);
      }
    })


    function getRegistered(cheerioBody){
      let cur = cheerioBody('[summary="Current Schedule"] .dddefault [name=TITLE]');
      let registered = [];
      for (var i = 0; i < cur.length; i++){
        registered.push(cur[i].attribs.value);
      }
      return registered;
    }

    function getNotRegistered(cheerioBody){
      let notRegistered = [];
      let tr = $('[summary="This layout table is used to present Registration Errors."] tr');
      let it = tr.first().next();

      for (var i = 1; i < tr.length; i++){
        let title = it.children().last().text();
        it = it.next();
        notRegistered.push(title);
      }

      return notRegistered;
    }

  }
}

for (u in accounts) {
  registerForClasses(accounts[u]);
}
