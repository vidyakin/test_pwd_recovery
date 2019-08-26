
const MongoClient = require('mongodb').MongoClient

const url = 'mongodb://localhost:27017/passwordStore'

let demoUsers = [
    {
        id: 1,
        name: "Василий З.",
        email: 'vasya@gmail.com',
        password: '123456'
    },
    {
        id: 2,
        name: "Петр И.",
        email: 'petya@gmail.com',
        password: 'asdfqwer'
    },
    {
        id: 3,
        name: "Света А.",
        email: 'sveta@gmail.com',
        password: 'qazwsxedc'
    }
]

exports.connectDb = async (app) => {
    let client = await new MongoClient(url, {useNewUrlParser: true, useUnifiedTopology: true}).connect()
    if (client) {
    //.then( client => {
            app.locals.db = client.db('passwordStore')
            app.locals.dbClient = client
            //passwords = db.collection('passwords')               
            console.log('= = = Соединение с БД установлено, входите: http://localhost:3000')                                            
            //return {client, db}
       // })
    }
    else {
       // .catch(err => {
            console.log('ОШИБКА: '+err);
            //return null
     //   })
    }
}

exports.populateDemo = async (db) => {
    console.log('БД была заполнена демо-данными');    
    return await db.collection("passwords").insertMany(demoUsers)
}
             
exports.fillDemoDataWhenFirst = async (db) => {
    // всегда смотрим в базу и проверяем если ли там пользователи
    let num = await db.collection('passwords').countDocuments({}) //, (err,num) => {
    
    if (num == 0) { // если записей нет, заполняем демо-данными
        await populateDemo(db)        
    }
    
    let msg = num == 0 ? 'Обнаружен первый запуск. БД была заполнена демо-данными' : ''

    return msg
}

