const express = require('express')
const MongoClient = require('mongodb').MongoClient
const dbUrl = 'mongodb://localhost:27017'

const app = express()

app
  .get('/', (req, res) => {
    res.redirect('/85654/1')
  })
  .get('/:gid/:page', (req, res) => {
    const gid = req.params.gid
    const page = req.params.page

    MongoClient.connect(dbUrl, { useNewUrlParser: true }, (err, client) => {
      if (err) throw new Error(err)
      console.log('Connected to MongoDB successfully.')
      const wall = client.db('rbx-wall-archive--dev').collection(`g${gid}`)
  
      wall.find({}, { skip: (page - 1)*100, limit: 10 }).toArray((err, result) => {
        if (err) throw new Error(err)
        res.json(result)
        client.close()
      })
    })
  })
  .listen(3000, () => {
    console.log('Server listening on port 3000...')
  })
