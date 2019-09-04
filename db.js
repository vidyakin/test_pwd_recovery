
const MongoClient = require('mongodb').MongoClient

const url = 'mongodb://localhost:27017/passwordStore'

const demoUsers = [
  {
    id: 1,
    name: 'Василий З.',
    email: 'vasya@gmail.com',
    password: '123456'
  },
  {
    id: 2,
    name: 'Петр И.',
    email: 'petya@gmail.com',
    password: 'asdfqwer'
  },
  {
    id: 3,
    name: 'Света А.',
    email: 'sveta@gmail.com',
    password: 'qazwsxedc'
  }
]

exports.connectDb = async (app) => {
  const client = await new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true }).connect()
  if (!client) {
    throw Error("No connection to database")
  }
  else {
    app.locals.db = client.db('passwordStore')
    app.locals.dbClient = client
    console.log('= = = Соединение с БД установлено, входите: http://localhost:3000')
  }
}

exports.populateDemo = async (db) => {
  console.log('БД была заполнена демо-данными')
  return db.collection('passwords').insertMany(demoUsers)
}

exports.fillDemoDataWhenFirst = async (db) => {
  // всегда смотрим в базу и проверяем если ли там пользователи
  const num = await db.collection('passwords').countDocuments({})

  if (num === 0) { 
    // если записей нет, заполняем демо-данными
    await populateDemo(db)
  }

  const msg = num === 0 ? 'Обнаружен первый запуск. БД была заполнена демо-данными' : ''

  return msg
}
