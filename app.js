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
const mongo = require('mongodb').MongoClient
const url = 'mongodb://localhost:27017'
admin.initializeApp({
  credential: admin.credential.cert(secrets.firebase),
  databaseURL: "https://stomprocket-status.firebaseio.com"
});

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

log.info(`Initialized Stomp Rocket status backend server with api key ${apiKey}`);

const bodyParser = require('body-parser');
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

app.get('/properties/', function (req, res, next) {
  const userToken = req.headers.user
  log.info('Got a request to get a users properties', userToken)
  if (userToken) {
    admin.auth().verifyIdToken(userToken)
    .then(function (decodedToken) {
      const uid = decodedToken.uid;
      mongo.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }, async (err, client) => {
        if (err) {
          console.error(err)
          return
        }
        const db = client.db('status-db')
        const properties = await db.collection('properties').find({users: uid}).toArray()
        log.info(`Found ${properties.length} properties for the user: ${uid}`)
        let response = []
        properties.forEach(property => {
          let upCounter = 0
          let downCounter = 0
          let responseTimeTotal = 0
          let chartData = []
          if (property.logArray.length > 0) {
            property.logArray = property.logArray.sort((a, b) => {
              //console.log(a.timeStamp, b.timeStamp)
              return a.timeStamp - b.timeStamp
            })
            property.logArray.forEach(log => {
              if (log.ok) {
                upCounter++
              } else {
                downCounter++
              }
              if (log.responseTime) {
                responseTimeTotal += log.responseTime
                chartData.push({
                  x: log.timeStamp,
                  y: log.responseTime
                })
              }

            })
            const lastLog = property.logArray[property.logArray.length - 1]
            response.push({
              fetched: true,
              name: property.name,
              id: property._id,
              url: property.url,
              status: lastLog.status,
              chartData: chartData,
              ok: lastLog.ok,
              lastPing: lastLog.timeStamp,
              lastResponseTime: lastLog.responseTime,
              averageResponseTime: Math.round(responseTimeTotal / property.logArray.length),
              upTime: Math.round(upCounter / (upCounter + downCounter) * 100)
            })
          } else {
            response.push({
              name: property.name,
              id: property._id,
              url: property.url,
              fetched: false,
              chartData: false,
              lastPing: false

            })
          }

        })
        res.status(200)
        res.send({success: true, result: response})
        res.end()

      })
    })
  } else {
    res.status('400')
    res.send({error: 'must have user token'})
    res.end()
  }

})
app.post('/user', (req, res, next) => {
  log.info('Got request to get information on a user')
  const userToken = req.headers.user
  if (userToken && req.body.email) {
    admin.auth().verifyIdToken(userToken)
    .then(function (decodedToken) {
      let uid = decodedToken.uid;
      mongo.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }, async (err, client) => {
        if (err) {
          console.error(err)
          return
        }
        const db = client.db('status-db')
        await db.collection('users').updateOne({_id: uid}, {$set: req.body})
        db.collection('secrets').findOne({_id: 'powerUsers'}, (err, powerUsers) => {
          let admin = false
          console.log(powerUsers)
          if (powerUsers) {
            if (powerUsers.admin.indexOf(uid) > -1) {
              admin = true
            }
          }

          log.info('updated user, admin:', admin)
          client.close()
          res.status(200)
          res.send({success: true, admin: admin})
          res.end()
        })

      })
    }).catch(function (error) {
      // Handle error
      res.status(400)
      res.send({error: 'bad user token'})
    });
  }
})
app.post('/property', (req, res, next) => {
  log.info('got request to create a new property')
  const userToken = req.headers.user
  const body = req.body
  if (userToken && body) {
    admin.auth().verifyIdToken(userToken)
    .then(function (decodedToken) {
      let uid = decodedToken.uid;
      mongo.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }, async (err, client) => {
        if (err) {
          log.error(err)
          return
        }
        const db = client.db('status-db')
        await db.collection('users').updateOne({_id: uid}, {$set: req.body})
        db.collection('secrets').findOne({_id: 'powerUsers'}, (err, powerUsers) => {


          client.close()
          if (powerUsers.admin.indexOf(uid) > -1) {

            log.info('parameters for new property', body)
            const users = body.users.split(',')
            let uids = []
            let newAccounts = []
            let newAccountPassword = 'welcome'
            mongo.connect(url, {
              useNewUrlParser: true,
              useUnifiedTopology: true
            }, async (err, client) => {
              if (err) {
                console.error(err)
                return
              }
              const db = client.db('status-db')
              await asyncForEach(users, async user => {
                let userData = await db.collection('users').findOne({email: user})
                console.log(userData)
                if (userData) {
                  uids.push(userData._id)
                } else {
                  newAccounts.push(user)
                }

              })
              await asyncForEach(newAccounts, async email => {
                let userRecord = await admin.auth().createUser({
                  email: email,
                  emailVerified: false,
                  disabled: false,
                  password: newAccountPassword
                })
                if (userRecord) {
                  log.info('createdUser', userRecord.uid)
                  uids.push(userRecord.uid)
                  await db.collection('users').insertOne({_id: userRecord.uid, email: email})
                } else {
                  log.error('user Creation error', userRecord)
                }
                return 1
              })
              console.log(uids)
              db.collection('properties').insertOne({
                name: body.name, url: body.url, logArray: [], users: uids
              }, (err, result) => {
                log.info('finished', {
                  success: true, newAccounts: newAccounts, newAccountPassword: newAccountPassword
                })
                client.close()
                res.status(200)
                res.send({success: true, newAccounts: newAccounts, newAccountPassword: newAccountPassword})
                res.end()
              })


            })

          } else {
            res.status(400)
            res.send({error: 'user does not have permission to create new properties'})
            res.end()
          }
        })

      })
    }).catch(err => {
      res.status(400)
      res.send({error: 'invalid user token'})
      res.end()
    })
  } else {
    log.info('invalid request')
    res.status(400)
    res.send({error: 'must include all data'})
    res.end()
  }
})

module.exports = app;
