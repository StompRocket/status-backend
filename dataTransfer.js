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
const firestore = admin.firestore()
firestore.collection('properties').get().then(snap => {
  snap.forEach(collection => {
    const collectionData = collection.data()
    mongo.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, async (err, client) => {
      if (err) {
        console.error(err)
        return
      }
      const db = client.db('status-db')
      let count = await db.collection('properties').find({_id: collection.id}).count()
      console.log(count)
      const logs = await firestore.collection('properties').doc(collection.id).collection('logs').get()
      const users = await firestore.collection('properties').doc(collection.id).collection('users').get()
      const logData = {}
      const usersData = []
      logs.forEach(i => {
        logData[i.id] = i.data()
      })
      users.forEach(i => {
        usersData.push(i.id)
      })

      if (count > 1) {
        db.collection('properties').insertOne({
          _id: collection.id, name: collectionData.name, url: collectionData.url, logs: logs, users: usersData
        })
      } else {
        db.collection('properties').updateOne({
          _id: collection.id
        }, {
          $set: {
            logs: logData, users: usersData
          }
        })
      }
      return await client.close()
    })


  })
})
firestore.collection('users').get().then(snap => {
  snap.forEach(user => {
    const userData = user.data()
    mongo.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, async (err, client) => {
      if (err) {
        console.error(err)
        return
      }
      const db = client.db('status-db')

      if (db.collection('users').find({_id: user.id}).count() < 1) {
        await db.collection('users').insertOne({
          _id: user.id, email: userData.email, lastLoggedIn: userData.lastLoggedIn
        })
      } else {
        await db.collection('users').updateOne({_id: user.id}, {$set: {lastLoggedIn: userData.lastLoggedIn}})
      }
      console.log('added user', user.id)
      return client.close()
    })
  })
})