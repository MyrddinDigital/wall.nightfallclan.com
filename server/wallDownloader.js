const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

const dbUrl = 'mongodb://localhost:27017';
const client = new MongoClient(dbUrl);
const dbName = 'rbx-wall-archive--dev';

const auth = axios.create({});
const gid = 85654;
const creds = {
  ctype: 'Username',
  cvalue: 'NoctemRex',
  password: '74dIJNzEbw3u@$VL%q%f'
}

function getAuthToken() {
  return new Promise((resolve, reject) => {
    axios.post('https://auth.roblox.com/v2/login').then(res => {
      reject(res);
    }).catch(err => {
      resolve(err.response.headers['x-csrf-token']);
    });
  });
}

function getCookie() {
  return new Promise((resolve, reject) => {
    auth.post('https://auth.roblox.com/v2/login', creds).then(res => {
      resolve(`${res.headers['set-cookie'].join(';')};`);
    }).catch(err => {
      reject(err);
    });
  });
}

function getWallPosts(nextPageCursor) {
  const limit = 100;
  const baseUrl = `https://groups.roblox.com/v2/groups/${gid}/wall/posts?sortOrder=Desc&limit=${limit}`;
  const url = nextPageCursor ? `${baseUrl}&cursor=${nextPageCursor}` : baseUrl;
  auth.get(url).then(posts => {
    client.connect(err => {
      if (err) throw new Error(err);
      console.log("Connected successfully to DB server");
      const db = client.db(dbName);
      const groupCollection = db.collection(`g${gid.toString()}`);
      
      groupCollection.insertMany(posts.data.data, (err, result) => {
        if (err) throw new Error(err);
        console.log(`Inserted ${result.ops.length} documents into the collection`);
        console.log(posts.data.data[0].created);
        const cursor = posts.data.nextPageCursor;
        if (cursor) {
          getWallPosts(cursor);
        } else {
          console.log('----------\nDone!');
          client.close();
        }
      });
    });
  }).catch(err => {
    console.log(err, 'err');
  });
}

(async function main() {
  try {
    auth.defaults.headers['X-CSRF-TOKEN'] = await getAuthToken();
    auth.defaults.headers.Cookie = await getCookie();
    getWallPosts(null);
  } catch(err) {
    console.log(err);
    console.log('error');
  }
})();
