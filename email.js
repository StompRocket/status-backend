const cron = require('node-cron');
const admin = require("firebase-admin");
const secrets = require("./private/keys.json")
const moment = require('moment-timezone')
const bunyan = require('bunyan');
const fetch = require('node-fetch')
let log = bunyan.createLogger({name: "stomprocket-status-processor"});
const serviceAccount = secrets.firebase;
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(secrets.sendgrid);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stomprocket-status.firebaseio.com"
});
const db = admin.firestore()

const msg = {
  to: 'rsf.sho@gmail.com',
  from: 'bot@status.ronanfuruta.com',
  templateId: 'd-74508094f842498893ead59fb5077c4e',
  dynamic_template_data: {
    name: 'bob',
    "site-name": 'Bob.com',
    link: 'ronanfuruta.com'
  },

};
sgMail.send(msg);