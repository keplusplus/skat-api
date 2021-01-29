require('dotenv-safe').config()
const mongodb = require('mongodb')

const connectionString = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`

module.exports.getGamesCollection = async () => {
    const client = await mongodb.MongoClient.connect(connectionString, { useUnifiedTopology: true })
    
    return client.db().collection('games')
}

module.exports.getId = (id) => new mongodb.ObjectID(id)