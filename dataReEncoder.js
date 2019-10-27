const cron = require('node-cron');
const mongo = require('mongodb').MongoClient
const url = 'mongodb://localhost:27017'
const admin = require("firebase-admin");
const secrets = require("./private/keys.json")
const moment = require('moment-timezone')
const bunyan = require('bunyan');
const fetch = require('node-fetch')
let log = bunyan.createLogger({name: "stomprocket-status-processor"});
const serviceAccount = secrets.firebase;
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(secrets.sendgrid);

mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, async (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('status-db')
  db.collection('properties').find().toArray((err, properties) => {
    properties.forEach(property => {
      console.log(property.name, property._id)
      const logObject = property.logs
      let logArray = []
      for (let key in logObject) {
        if (logObject.hasOwnProperty(key)) {
          //onsole.log(key, logObject[key]);
          logArray.push(logObject[key])
        }
      }
      db.collection('properties').updateOne({_id: property._id}, {$set: {logArray: logArray}}).then(err => {
        console.log('updated', property._id)
      })


    })
  })
})