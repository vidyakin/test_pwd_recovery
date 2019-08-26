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
app.use(session({secret: 'mySecretKey', cookie: {maxAge: 60000}, resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
        usernameField: 'token',
        passwordField: 'password',
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
    done(null, user.email);
});

passport.deserializeUser(function(id, done) {
    app.locals.db.collection('passwords').findOne({_id: id}, (err, user) => {
        done(err, user);
    });
});




// =========================================
// основная страница, поле для ввода емейла
app.get('/', (req,res)=>{
    // проверяем первый ли запуск, заполняем данными
    AppDB.fillDemoDataWhenFirst(app.locals.db)
        .then(r => {
            res.render('index', { r }) // выводим шаблон главной страницы
            
            console.log('Запрошена главная страница'); 
        })
    res.render('index', {})
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
        token: ''
    }
    // проверяем есть ли емейл в базе
    let email = req.body.email
    let r = await checkEmail(email)
    if (r) { // есть мыло
        
        data.token = await getToken()  // генерим тут токен
        let expiredAt = new Date()
        expiredAt.setHours(expiredAt.getHours()+1)
        // записываем в базу {user_id, token, expireAt}
        try {
            let res = await app.locals.db.collection('tokens').insertOne({ token: data.token, user: email, isActive: true, expiredAt})
            if (!res) {
                data.msg = 'Ошибка записи токена, не получен результат записи'
                //res.render('index', data)
            }
            else {
                //data.recoverLink = '/recover?token='+data.token  // "шлем" на почту - выводим ссылку на страницу из шаблона
                data.msg = 'Перейдите по ссылке для ввода нового пароля'
                // nodemailer: отправить письмо
                Mail.sendMail(email, token)
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
    console.log(`POST запрос: ${email}`); 
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
        if (err) {
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
app.post('/confirm', auth, async (req, res, next)=>{
    // Проверяем пароль на проверки
    let data = {
        msg: '',
        token: req.body.token
    }
    if (req.body.password != req.body.passwordConfirm) {
        data.msg = 'Пароли не совпадают, введите повторно'
    }
    else if (req.body.password.length < 5) {
        data.msg = 'Длина пароля должна быть не менее 5 симолов'
    }
    else {
        // находим по токену пользователя и его емейл
        if (data.token  == "") {
            msg = "Токен запроса отсутствует"
        }
        else {
            let userInfo = await app.locals.db.collection('tokens').findOne({token: data.token})
            if (userInfo) {
                // записываем новый пароль в пользователя, 
                let upd = await app.locals.db.collection('passwords').updateOne({email: userInfo.user}, {$set: {password: req.body.password}})
                if (upd.result.ok == 1) {
                       // помечаем токен как использованный
                    let tokenUpd = await app.locals.db.collection('tokens').updateOne({token: data.token}, {$set: {isActive: false}})
                    if (tokenUpd.result.ok == 1) {
                         // логииним через пасспорт
                         
                    }           
                } else {
                    msg = `Ошибка при обновлении пароля: ${upd.message}`
                }
            }
            else {
                msg = `Токен ${data.token} не найден в базе`
            }
        }        
    }
    res.render('newPassword', data)
    console.log(`Передан новый пароль: ${req.body.password}`)
})


app.listen(3000, async ()=>{
    console.log('------ Приложение запущено на 3000 порту');
    await AppDB.connectDb(app)        
})





