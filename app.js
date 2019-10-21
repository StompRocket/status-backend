var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const router = express.Router();
var app = express();
const admin = require("firebase-admin");
const secrets = require("./private/keys.json")
const moment = require('moment-timezone')
const bunyan = require('bunyan');
let log = bunyan.createLogger({name: "stomprocket-status-server"});
const hat = require('hat');
const cors = require('cors')
let apiKey = hat();
admin.initializeApp({
  credential: admin.credential.cert(secrets.firebase),
  databaseURL: "https://stomprocket-status.firebaseio.com"
});
const db = admin.firestore()

log.info(`Initialized Stomp Rocket status backend server with api key ${apiKey}`)
db.collection('secrets').doc('apiKey').set({
  key: apiKey,
  timeStamp: Date.now()
}).then(i => {
  db.collection('secrets').doc('apiKey').onSnapshot(snap => {
    const data = snap.data()

    if (apiKey != data.key) {
      apiKey = data.key
      log.info(`API KEY UPDATED: ${apiKey}`)
    }
  })
})

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(cors())
app.get('/', function (req, res, next) {

  res.send('respond with a resource');
});
app.get('/property/:id', function (req, res, next) {
  const key = req.headers.authorization
  const userToken = req.headers.user
  const propertyId = req.params.id
  log.info(key, userToken, propertyId)
  if (key, userToken, propertyId) {
    if (key == apiKey) {
      log.info('api key good')
      admin.auth().verifyIdToken(userToken)
      .then(function (decodedToken) {
        let uid = decodedToken.uid;
        console.log(uid)
        db.collection('properties').doc(propertyId).get().then(snap => {
          if (snap.exists) {
            const property = snap.data()
            console.log(property)

            db.collection('properties').doc(propertyId).collection('users').get().then(users => {
              let usersArray = []
              users.forEach(user => {
                usersArray.push(user.id)
              })
              //console.log(usersArray)
              if (usersArray.indexOf(uid) > -1) {
                log.info('user authorized')
                let response = property
                db.collection('properties').doc(propertyId).collection('logs').get().then(logs => {
                  let allLogs = []
                  let upCounter = 0
                  let downCounter = 0
                  let responseTimeTotal = 0
                  let chartData = []
                  logs.forEach(logSnap => {
                    const log = logSnap.data()
                    if (log.ok) {
                      upCounter++
                    } else {
                      downCounter++
                    }
                    responseTimeTotal += log.responseTime
                    allLogs.push(log)
                  })
                  allLogs = allLogs.sort((a, b) => {
                    //console.log(a.timeStamp, b.timeStamp)
                    return a.timeStamp - b.timeStamp
                  })
                  allLogs.forEach(i => {
                    chartData.push({
                      x: i.timeStamp,
                      y: i.responseTime
                    })
                  })
                  const lastLog = allLogs[allLogs.length - 1]
                  response.status = lastLog.status
                  response.chartData = chartData
                  response.ok = lastLog.ok
                  response.lastPing = lastLog.timeStamp
                  response.lastResponseTime = lastLog.responseTime
                  response.averageResponseTime = Math.round(responseTimeTotal / allLogs.length)
                  response.upTime = Math.round(upCounter / (upCounter + downCounter) * 100)
                  res.status(200)
                  res.send(response)
                  res.end()
                })


              } else {
                log.info('user not authorized for this property')
                res.status('400')
                res.send({error: 'user not authorized for this property'})
                res.end()
              }
            })

          } else {
            res.status(404)
            res.send({error: 'property does not exist'})
            res.end()
          }
        })

      }).catch(function (error) {
        log.info('user token bad')
        res.status('400')
        res.send({error: 'user token invalid'})
        res.end()
        // Handle error
      });
    } else {
      log.info('api key bad')
      res.status('400')
      res.send({error: 'api key invalid'})
      res.end()
    }
  } else {
    log.info('invalid request')
    res.status(400)
    res.send({error: 'must include all data'})
    res.end()
  }

});

module.exports = app;
