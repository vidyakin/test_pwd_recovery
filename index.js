const express = require('express')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const session = require('express-session')


const AppDB = require('./db.js')
const Mail = require('./mail.js')

const app = express();

app.set('view engine', 'pug');
app.use(express.urlencoded({extended: true}));

// = = = PASSPORT = = =
app.use(session({secret: 'mySecretKey', cookie: {maxAge: 10*60*1000}, resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
        usernameField: 'email',
        passReqToCallback: true
    }, async (req, username, password, done) => {
        let tokenInfo = await app.locals.db.collection('tokens').findOne({token: username})
        if (tokenInfo) {
            let user = tokenInfo.user
            return user 
                ? done(null, user) 
                : done(null, false, req.flash(`Пользователь ${user} не найден`))
        }
    }
))

passport.serializeUser(function(user, done) {
    console.log('Cериализация: ',user);
    done(null, user);
});

passport.deserializeUser(function(email, done) {
    console.log('Десериализация: ',email);    
    app.locals.db.collection('passwords').findOne({email}, (err, user) => {
        done(err, user);
    });
});




// =========================================
// основная страница, поле для ввода емейла
app.get('/', (req,res)=>{
    // console.log('Запрошена главная страница');
    // let data = { msg: '', time: new Date() }
    // res.render('index', data) // выводим шаблон главной страницы
    // проверяем первый ли запуск, заполняем данными
    AppDB.fillDemoDataWhenFirst(app.locals.db)
        .then(r => {
            console.log('Запрошена главная страница');
            res.render('index', { msg: r, time: new Date() }) // выводим шаблон главной страницы
        }).catch(err => {
            console.log('Ошибка рендера главной страницы ', err);            
            res.render('index', {msg: err})
        })   
})


async function checkEmail(email) {
    return await app.locals.db.collection('passwords').findOne({email})
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
        token: '',
        sent: false
    }
    // проверяем есть ли емейл в базе
    let email = req.body.email
    let emailExists = await checkEmail(email)
    if (emailExists) { // есть мыло
        
        data.token = await getToken()  // генерим тут токен
        let expiredAt = new Date()
        expiredAt.setHours(expiredAt.getHours()+1)
        try {
            // записываем в базу {user_id, token, expireAt}
            let newToken = await app.locals.db.collection('tokens').insertOne({ token: data.token, user: email, isActive: true, expiredAt})
            if (!newToken) {
                data.msg = 'Ошибка записи токена, не получен результат записи'
                res.render('index', data)
            }
            else {
                //data.recoverLink = '/recover?token='+data.token  // "шлем" на почту - выводим ссылку на страницу из шаблона
                Mail.sendMail(email, data.token, sentInfo => {
                    data.msg = 'Письмо было отправлено на почту, перейдите по ссылке в нем, чтобы продолжить'
                    data.sent = true                
                    // в БД лог отправки
                    app.locals.db.collection('email_logs').insertOne({ token: data.token, user: email, sent: sentInfo.messageId, time: new Date()})
                    res.render('index', data)
                    console.log('ПИСЬМО ОТПРАВЛЕНО');
                })
            }
        } catch (err) {
            data.msg = 'Ошибка записи токена:' + err.message
            res.render('index', data)
        }
    } else {
        // нет мыла
        data.msg = 'Такой email не найден. Зарегистрируйтесь'
        res.render('index', data)
    }
    // если есть: 
    console.log(`POST запрос на получение письма: ${email}, отправлено: ${data.sent}`); 
})

// 
// прием токена по ссылке
app.get('/recover/:token', async (req, res)=> {
    // найти токен в базе, проверить дату
    let msg = 'msg init'
    tokenInfo = await app.locals.db.collection('tokens').findOne({token: req.params.token})
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

const auth = (req, res, next) => {
    passport.authenticate('local', (err,user,info) => {
        if (err !== null) {
            console.log('Ошибка АУТЕНТИФИКАЦИИ');
            res.status(401).send(error)
            //res.render('index', {msg: `Ошибка смены пароля, ${err}`})
        } else if (!user) {
            console.log('АУТЕНТИФИКАЦИЯ НЕ прошла!');
            res.status(401).send(info)
            //res.render('index', {msg: 'Пользователь авторизован, пароль изменен'})
        }
        else next()
        // if (!user && !err) {
        //     console.log('Аутентификация: '+info);
        // }
    })(req, res, next)
}

// прием формы с новым паролем, проверка, запись нового пароля, авторизация 
app.post('/confirm', async (req, res, next)=>{
    // Проверяем пароль на проверки
    let data = {
        msg: '',
        token: req.body.token,
        status: ''
    }
    if (req.body.password != req.body.passwordConfirm) {
        data.msg = 'Пароли не совпадают, введите повторно'
        data.status = 'NOT_MATCH'
    }
    else if (req.body.password.length < 5) {
        data.msg = 'Длина пароля должна быть не менее 5 симолов'
        data.status = 'LESS_5'
    }
    else {
        // находим по токену пользователя и его емейл
        if (data.token  == "") {
            msg = "Токен запроса отсутствует"
            data.status = 'TOKEN_EMPTY'
        }
        else {
            // находим какому пользователю соответствует токен
            let userInfo = await app.locals.db.collection('tokens').findOne({token: data.token})
            if (userInfo) {
                // записываем новый пароль в пользователя, 
                let upd = await app.locals.db.collection('passwords').updateOne({email: userInfo.user}, {$set: {password: req.body.password}})
                if (upd.result.ok == 1) {
                       // помечаем токен как использованный
                    let tokenUpd = await app.locals.db.collection('tokens').updateOne({token: data.token}, {$set: {isActive: false}})
                    if (tokenUpd.result.ok == 1) {
                         // логииним через пасспорт
                        data.msg = `Пароль изменен на ${req.body.password}`
                        data.status = 'PWD_UPD_OK'
                        req.logIn(userInfo.user, err => {
                            if (err) {
                                data.msg = `Ошибка при авторизации пользователя: ${err}`
                                data.status = 'LOGIN_OK'
                                console.log('Ошибка залогинивания ', err);
                                return next(err)
                            }
                            return res.redirect('/recovered')
                         })
                    }           
                } else {
                    data.msg = `Ошибка при обновлении пароля: ${upd.message}`
                    data.status = 'PWD_UPD_ERR'
                }
            }
            else {
                data.msg = `Токен ${data.token} не найден в базе`
                data.status = 'NO_TOKEN'
            }
        }        
    }
    //res.render('newPassword', data)
    console.log(`Передан новый пароль: ${req.body.password}, событие ${data.status}`)
})

app.get('/recovered', auth, (req,res) => {
    render('recovered')
})


app.listen(3000, async ()=>{
    console.log('------ Приложение запущено на 3000 порту');
    await AppDB.connectDb(app)        
})





