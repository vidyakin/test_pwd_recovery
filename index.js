const express = require('express')
const assert = require('assert');

const app = express();
const MongoClient = require('mongodb').MongoClient
const url = 'mongodb://localhost:27017'

app.set('view engine', 'pug');
app.use(express.urlencoded());

const client = new MongoClient(url)
let db

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

async function populateDemo() {
    console.log('БД была заполнена демо-данными');    
    return await db.collection("passwords").insertMany(demoUsers)
}
             
async function fillDemoDataWhenFirst() {
    // всегда смотрим в базу и проверяем если ли там пользователи
    let num = await db.collection('passwords').countDocuments({}) //, (err,num) => {
    
    if (num == 0) { // если записей нет, заполняем демо-данными
        await populateDemo()        
    }
    
    let msg = num == 0 ? 'Обнаружен первый запуск. БД была заполнена демо-данными' : ''

    return msg
}
   
function connectDb() {
    client.connect(err => {
        if (err) {
            console.log('Не подключились к БД');            
        }
        else {
            try {
                db = client.db('passwordStore') 
                //passwords = db.collection('passwords')               
                console.log('= = = Соединение с БД установлено, входите: http://localhost:3000')                                            
            } catch (error) {
                console.log('ОШИБКА: '+error);
            }            
        }
    })
}

// =========================================
// основная страница, поле для ввода емейла
app.get('/', (req,res)=>{
    // проверяем первый ли запуск, заполняем данными
    fillDemoDataWhenFirst()
        .then(r => {
            res.render('index', { r }) // выводим шаблон главной страницы
            
            console.log('Запрошена главная страница'); 
        })
})


async function checkEmail(email) {
    return await db.collection('passwords').findOne({email})
}

function getToken() {
    return new Promise( (resolve, reject) => {
        require('crypto').randomBytes(16, (err,buf) => resolve(buf.toString('hex'))) 
    })
}
    

// Сброс пароля через отправку формы
app.post('/recover', async (req, res)=>{
    // данные для шаблона
    let data = { 
        recoverLink: '',
        msg: '',
        token: ''
    }
    // проверяем есть ли емейл в базе
    let r = await checkEmail(req.body.mail)
    if (r) { // есть мыло
        
        data.token = await getToken()  // генерим тут токен
        let expiredAt = new Date()
        expiredAt.setHours(expiredAt.getHours()+1)
        // записываем в базу {user_id, token, expireAt}
        try {
            let res = await db.collection('tokens').insertOne({ token: data.token, user: req.body.mail, isActive: true, expiredAt})
            if (!res) {
                data.msg = 'Ошибка записи токена, не получен результат записи'
                //res.render('index', data)
            }
            else {
                //data.recoverLink = '/recover?token='+data.token  // "шлем" на почту - выводим ссылку на страницу из шаблона
                data.msg = 'Перейдите по ссылке для ввода нового пароля'
            }
        } catch (err) {
            data.msg = 'Ошибка записи токена:' + err
        }        
        
    } else {
        // нет мыла
        data.msg = 'Такой email не найден. Зарегистрируйтесь'
        res.render('index', data)
    }
       // })
    // если есть: 
    res.render('index', data)
    console.log(`POST запрос: ${req.body.mail}`); 
})

// прием токена по ссылке
app.get('/recover/:token', (req, res)=>{
    // найти токен в базе, проверить дату
    let msg = 'msg init'
    tokenInfo = await db.collection('tokens').findOne({token: req.params.token})
    if (tokenInfo) {
        if (tokenInfo.expiredAt < new Date()) {
            msg = 'Срок действия ссылки для смены пароля истек, получите новую ссылку'
            res.render('index', {token: req.params.token, msg})
        }
        else { // ВСЕ ОК
            res.render('newPassword', {token: req.params.token})
        }
    }
    else {
        msg = 'Ссылка не действительная, токен не найден'
        res.render('index', {token: req.params.token, msg})
    }
    // выводим страницу с формой ввода нового пароля    
    console.log(`Передан токен ${req.params.token}, Сообщение: ${msg}`); 
})

// прием формы с новым паролем, проверка, запись нового пароля, авторизация 
app.post('/confirm', (req, res)=>{
    // Проверяем пароль на проверки
    let data = {
        msg: ''
    }
    if (req.params.password != req.params.passwordConfirm) {
        data.msg = 'Пароли не совпадают, введите повторно'
    }
    else if (req.params.password.length < 5) {
        data.msg = 'Длина пароля должна быть не менее 5 симолов'
    }
    else {
        // находим по токену пользователя и его емейл
        db.collection('tokens').findOne({token: req.params.token})
            .then(userInfo => {
                // записываем новый пароль в пользователя, 
                db.collection('passwords').update({email: userInfo.email}, {$set: {password: req.params.password}})
                    .then(r => {
                        // помечаем токен как использованный
                        db.collection('tokens').update({token: req.params.token}, {$set: {isActive: false}})
                            .then(r => {
                                // логииним через пасспорт

                            })
                    })
            }
    }
    console.log(`Передан новый пароль: ${req.params.password}`)
})


app.listen(3000, ()=>{
    console.log('------ Приложение запущено на 3000 порту');
    connectDb()    
})

process.on("SIGINT", () => {
    dbClient.close();
    process.exit();
});