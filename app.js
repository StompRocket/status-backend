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
const bodyParser = require('body-parser')
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.use(logger('dev'));

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

        db.collection('properties').doc(propertyId).get().then(snap => {
          if (snap.exists) {
            const property = snap.data()


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
                    if (log.responseTime) {
                      responseTimeTotal += log.responseTime
                      allLogs.push(log)
                    }

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
app.post('/property', function (req, res, next) {
  const key = req.headers.authorization
  const userToken = req.headers.user

  log.info(key, userToken)
  if (key, userToken, req.body) {
    if (key == apiKey) {
      log.info('api key good')
      admin.auth().verifyIdToken(userToken)
      .then(function (decodedToken) {
        let uid = decodedToken.uid;

        db.collection('secrets').doc('powerusers').get().then(i => {
          if (i.data().admin.indexOf(uid) > -1) {
            const body = req.body
            console.log(body.users)
            const users = body.users.split(',')
            let uids = []
            let newAccounts = []
            let newAccountPassword = 'welcome'
            log.info('handling users')
            users.forEach(async user => {
              let snap = await db.collection('users').where('email', '==', user).get()
              if (snap.empty) {
                log.info('user does not exist', user)
                let userRecord = await admin.auth().createUser({
                  email: user,
                  emailVerified: false,
                  disabled: false,
                  password: newAccountPassword
                })
                if (userRecord.uid) {
                  log.info('createdUser', userRecord.uid)
                  uids.push(userRecord.uid)
                  await db.collection('users').doc(userRecord.uid).set({
                    email: user,
                    properties: []
                  })
                  newAccounts.push(user)
                } else {
                  log.error('user Creation error', userRecord)
                }


              }
              snap.forEach((i) => {
                if (i.id) {
                  console.log('user exists', user)
                  uids.push(i.id)
                }

              })
              console.log(uids)
              if (uids.length === users.length) {
                log.info('creating property')

                db.collection('properties').add({
                  name: body.name,
                  url: body.url
                }).then(ref => {
                  let id = ref.id
                  let completed = []
                  uids.forEach(async uid => {
                    let snap = await db.collection('users').doc(uid).get()
                    let currentProps = snap.data().properties
                    currentProps.push(id)
                    await db.collection('properties').doc(id).collection('users').doc(uid).set({email: true})
                    await db.collection('users').doc(uid).update({properties: currentProps})
                    completed.push(uid)
                    if (completed.length === uids.length) {
                      log.info('finished', {
                        sucess: true, newAccounts: newAccounts, newAccountPassword: newAccountPassword
                      })
                      res.status(200)
                      res.send({sucess: true, newAccounts: newAccounts, newAccountPassword: newAccountPassword})
                      res.end()
                    }
                  })

                })
              }


            })


          } else {
            log.info('user not authorized to create properties')
            res.status('400')
            res.send({error: 'user not authorized to create properties'})
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
