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
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stomprocket-status.firebaseio.com"
});
const db = admin.firestore()
log.info(`Initialized Stomp Rocket Status Processor ${moment().tz("America/Los_Angeles").format('dddd, MMMM Do YYYY, h:mm:ss a')}`);
let properties = []


function check() {
  log.info('starting a check')
  properties.forEach(property => {
    log.info('checking', property.data.url, property.data.name, property.id)
    const startTime = moment()
    let result = {}
    fetch(property.data.url, {
      method: 'get'
    }).then(res => {
      const endTime = moment()
      const endTimeUnix = endTime.unix()
      //console.log(endTimeUnix)
      if (res.ok) {

        result = {
          timeStamp: endTimeUnix,
          status: res.status,
          ok: res.ok,
          responseTime: endTime.diff(startTime, 'milliseconds')
        }
        log.info(`${property.id} status good ${res.status} response time: ${result.responseTime}`)

      } else {
        log.info(`${property.id} status ${res.status}`)
        result = {
          timeStamp: endTimeUnix,
          status: res.status,
          ok: res.ok
        }
      }
      //console.log(property.id, result.timeStamp, result)
      /*
      db.collection('properties').doc(property.id).collection('logs').add(result).then(i => {
        log.info('written property to firebase', i.error)
      })*/
      mongo.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }, (err, client) => {
        if (err) {
          console.error(err)
          return
        }
        const db = client.db('status-db')
        const collection = db.collection('properties')

        userCollection.find().toArray((err, items) => {
          console.log(items)
        })
        userCollection.find({name: 'Togo'}).toArray((err, items) => {
          console.log(items)
        })
      })
    })
  })
}

db.collection('properties').onSnapshot(snapshot => {
  properties = []
  snapshot.forEach(snap => {
    properties.push({id: snap.id, data: snap.data()})
  })
  log.info('updated properties ', properties.length, 'in total')
  check()
})


cron.schedule('*/5 * * * *', () => {
  log.info('running checks every 5 minutes', moment().tz("America/Los_Angeles").format('h:mm:s a'));
  check()
});