var express = require('express');
var router = express.Router();
const admin = require("firebase-admin");
const secrets = require("./private/keys.json")
const moment = require('moment-timezone')
const bunyan = require('bunyan');
let log = bunyan.createLogger({name: "stomprocket-status-propertyFetcher"});
admin.initializeApp({
  credential: admin.credential.cert(secrets.firebase),
  databaseURL: "https://stomprocket-status.firebaseio.com"
});
const db = admin.firestore()
/* GET users listing. */
router.get('/property/:id', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;
