const mongo = require('mongodb').MongoClient
const url = 'mongodb://localhost:27017'
mongo.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}, async (err, client) => {
  if (err) {
    console.error(err)
    return
  }
  const db = client.db('status-db')
  await db.collection('secrets').insertOne({_id: 'powerUsers', admin: ['B4GogxIPB7PIAbxA8VcXPskk6O63']})
  return await client.close()
})