const express = require('express')
const redis = require('redis');
const bodyParser = require('body-parser');
//const fetch = require('node-fetch');
const crypto = require('crypto');
const cors = require('cors');

const admin = require("firebase-admin");
const serviceAccount = require("./memeloard-4f850-firebase-adminsdk-kzffv-5a2d2713fa.json");

fireapp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const docRef = db.collection('Rooms')//.doc('user1');

function generateUniqueCode() {
  const currentTime = Date.now().toString(); // Get current timestamp as string
  const hash = crypto.createHash('md5').update(currentTime).digest('hex'); // Generate hash
  const uniqueCode = hash.slice(0, 7); // Extract the first 7 characters of the hash
  return uniqueCode;
}

function generateNameUniqueCode(name) {
  const currentTime = Date.now().toString(); // Get current timestamp as string
  const hash = crypto.createHash('md5').update(name + currentTime).digest('hex'); // Generate hash
  const uniqueCode = hash.slice(0, 7); // Extract the first 7 characters of the hash
  return uniqueCode;
}

const app = express()
const port = 3001
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());


//Join Random Room

app.get('/hello', async (req, res) => {
  res.send("hello")
})

app.post('/jpr', async (req, res) => {
  try {
      const name = req.body.name;
      const ncode = generateNameUniqueCode(name)
      const query = await docRef.where(admin.firestore.FieldPath.documentId(), '==', req.body.url).get();
      //console.log(query.docs[0])
      if (!query.empty) {
        const document = query.docs[0];
        if (Object.keys(document.data().players).length<9){
        await docRef.doc(document.id).update({
          ['players.'+ncode]: {name:name,face:req.body.face}
         });
        //await publisher.publish('Channel2', JSON.stringify({cmd:"update",data:{room:document.id,p:ncode}}));
        res.send({server:"Ok",uid:ncode})
      }
      else{
        res.send({server:"Room is Full"});
      }
      } else {
        res.send({server:"Room Not Found"});
      }
      
    } catch (error) {
      console.error('Error', error);
      res.status(500).send('Error');
    }
});

// Create Players Room
app.post('/cpr', async (req, res) => {
  try {
    
      const name = req.body.name;
      const code = generateUniqueCode()
      const ncode = generateNameUniqueCode(name)
      const json = {
        t: new Date().toLocaleString(),
        players:{
          [ncode]:{name:name,face:req.body.face}
        }

      }
      await docRef.doc(code).set(json)
      
      res.send({url:code,uid:ncode});
    } catch (error) {
      console.error('Error', error);
      res.status(500).send('Error');
    }
});

// Redis 
const client = redis.createClient({
  socket:{
  host: 'redis-14242.c212.ap-south-1-1.ec2.cloud.redislabs.com',
  port: 14242},
  username: 'default',
  password: 'i3haNf9pcuzokuc7pGmVmNz7TA4dRtiF',
});

const subscriber = client.duplicate();
const publisher = client.duplicate();

(async () => {
await subscriber.connect();
await subscriber.subscribe('Channel1', (message) => {
  json = JSON.parse(message)// 'message'
  
    if (json.cmd==="delplyr") {
      const fieldPath = new admin.firestore.FieldPath('players', json.data.p);
      docRef.doc(json.data.room).get().then((doc) => {
        if (doc.exists) {
              docRef.doc(json.data.room).update(fieldPath,admin.firestore.FieldValue.delete());       
        } else {
            // doc.data() will be undefined in this case
            console.log("No such document!");
        }
    }).catch((error) => {
        console.log("Error getting document:", error);
    });    
    }
 
});
})();


client.on('connect', () => {
  console.log('Connected to Redis Cloud');
});

client.on('error', (error) => {
  console.error('Error connecting to Redis:', error);
});

client.connect();
publisher.connect();
app.listen(port, async () => {
  //console.log(await client.json.get('RoomDb'))
  console.log(`Listening on port ${port}`)
})