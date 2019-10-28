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

log.info(`Initialized Stomp Rocket Status Processor ${moment().tz("America/Los_Angeles").format('dddd, MMMM Do YYYY, h:mm:ss a')}`);

function check() {
  log.info('starting a check')
  mongo.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }, (err, client) => {
    if (err) {
      console.error(err)
      return
    }
    const db = client.db('status-db')
    db.collection('properties').find({}, {_id: 1, name: 1, url: 1}).toArray((err, properties) => {
      client.close()
      properties.forEach(async property => {
        log.info('checking', property.url, property.name, property._id)
        const startTime = moment()
        let result = {}
        const res = await fetch(property.url, {
          method: 'get'
        })
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
          log.info(`${property._id} status good ${res.status} response time: ${result.responseTime}`)

        } else {
          log.info(`${property._id} status ${res.status}`)
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
        }, async (err, client) => {
          if (err) {
            console.error(err)
            return
          }
          const db = client.db('status-db')
          log.info(`updating: ${property._id}`)
          await db.collection('properties').updateOne({_id: property._id}, {
            $push: {logArray: result}
          }).catch(err => {
            console.log(err)
          })
          log.info(`updated: ${property._id}`)
          client.close()
        })



      })


    })
  })

}

/*
db.collection('properties').onSnapshot(snapshot => {
  properties = []
  snapshot.forEach(snap => {
    properties.push({id: snap.id, data: snap.data()})
  })
  log.info('updated properties ', properties.length, 'in total')
  check()
})

 */

check()
cron.schedule('*/5 * * * *', () => {
  log.info('running checks every 5 minutes', moment().tz("America/Los_Angeles").format('h:mm:s a'));
  check()
});
