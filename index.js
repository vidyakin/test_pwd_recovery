const express = require('express')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const session = require('express-session')

const AppDB = require('./db.js')
const Mail = require('./mail.js')

const app = express()

app.set('view engine', 'pug')
app.use(express.urlencoded({ extended: true }))

// = = = PASSPORT = = =
app.use(session({ secret: 'mySecretKey', cookie: { maxAge: 10 * 60 * 1000 }, resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())

passport.use(new LocalStrategy({
  usernameField: 'email',
  passReqToCallback: true
}, async (req, username, password, done) => {
  const tokenInfo = await app.locals.db.collection('tokens').findOne({ token: username })
  if (tokenInfo) {
    const user = tokenInfo.user
    return user
      ? done(null, user)
      : done(null, false, req.flash(`Пользователь ${user} не найден`))
  }
}
))

passport.serializeUser(function (user, done) {
  done(null, user)
})

passport.deserializeUser(function (email, done) {
  app.locals.db.collection('users').findOne({ email }, (err, user) => {
    done(err, user)
  })
})

// =========================================
// основная страница, поле для ввода емейла
app.get('/', (req, res) => {
  AppDB.fillDemoDataWhenFirst(app.locals.db)
    .then(r => {
      console.log('Запрошена главная страница')
      res.render('index', { msg: r, time: new Date() }) // выводим шаблон главной страницы
    }).catch(err => {
      console.log('Ошибка рендера главной страницы ', err)
      res.render('index', { msg: err })
    })
})

function getToken () {
  return new Promise((resolve, reject) => {
    require('crypto').randomBytes(16, (err, buf) => resolve(buf.toString('hex')))
  })
}

// Сброс пароля через отправку формы
app.post('/recover', async (req, res) => {
  // данные для шаблона
  const data = {
    recoverLink: '',
    msg: '',
    token: '',
    sent: false
  }
  
  // проверяем есть ли емейл в базе
  const email = req.body.email
  const emailExists = await app.locals.db.collection('users').findOne({ email })
  
  if (emailExists) { 
    data.token = await getToken() // генерим тут токен
    
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1) // TODO: подключить moment.js
    
    try {
      // записываем в базу {user_id, token, expireAt}
      const newToken = await app.locals.db.collection('tokens').insertOne({ token: data.token, user: email, isActive: true, expiresAt })
      if (!newToken) {
        data.msg = 'Ошибка записи токена, не получен результат записи'
        res.render('index', data)
      } else {
        
        // "шлем" на почту - выводим ссылку на страницу из шаблона
        // пишем в БД лог отправки
        app.locals.db.collection('email_logs').insertOne({ token: data.token, user: email, sent: sentInfo.messageId, time: new Date() })
        
        // TODO: убрать коллбэки
        Mail.sendMail(email, "Восстановление пароля", "tmpl_main", data.token, sentInfo => {
          // TODO: https://gitlab.com/nicky000/mindcast/merge_requests/1#note_211718777 - доработать обновление лога 
          data.msg = 'Письмо было отправлено на почту, перейдите по ссылке в нем, чтобы продолжить'
          data.sent = true
          res.render('index', data)
        })
      }
    } catch (err) {
      data.msg = 'Ошибка записи токена:' + err.message
      res.render('index', data)
    }
  } else {
    // нет емейла в базе 
    data.msg = 'Такой email не найден. Зарегистрируйтесь'
    res.render('index', data)
  }
  // TODO: сделать вывод в консоль только в dev-mode (как?)
  console.log(`POST запрос на получение письма: ${email}, отправлено: ${data.sent}`)
})

/**
 * Прием токена по ссылке
 */
app.get('/recover/:token', async (req, res) => {
  
  // найти токен в базе, проверить дату
  let msg = 'msg init'
  const tokenInfo = await app.locals.db.collection('tokens').findOne({ token: req.params.token })
  
  if (tokenInfo) {
    if (tokenInfo.expiresAt < new Date()) {
      msg = 'Срок действия ссылки для смены пароля истек, получите новую ссылку'
      res.render('index', { token: req.params.token, msg })
    } else { // ВСЕ ОК
      res.render('newPassword', { token: req.params.token })
    }
  } else {
    msg = 'Ссылка не действительная, токен не найден'
    res.render('index', { token: req.params.token, msg })
  }
  // выводим страницу с формой ввода нового пароля
  //console.log(`Передан токен ${req.params.token}, Сообщение: ${msg}`)
})

// m/ware проверки аутентентификации
const auth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err !== null) {
      console.log('Ошибка АУТЕНТИФИКАЦИИ')
      res.status(401).send(err)
      // res.render('index', {msg: `Ошибка смены пароля, ${err}`})
    } else if (!user) {
      console.log('АУТЕНТИФИКАЦИЯ НЕ прошла!')
      res.status(401).send(info)
      // res.render('index', {msg: 'Пользователь авторизован, пароль изменен'})
    } else next()
    // if (!user && !err) {
    //     console.log('Аутентификация: '+info);
    // }
  })(req, res, next)
}

// прием формы с новым паролем, проверка, запись нового пароля, авторизация
app.post('/confirm', async (req, res, next) => {
  // Проверяем пароль на проверки
  const data = {
    msg: '',
    token: req.body.token,
    status: ''
  }
  if (req.body.password !== req.body.passwordConfirm) {
    data.msg = 'Пароли не совпадают, введите повторно'
    data.status = 'NOT_MATCH'
  } else if (req.body.password.length < 5) {
    data.msg = 'Длина пароля должна быть не менее 5 симолов'
    data.status = 'LESS_5'
  } else {
    // находим по токену пользователя и его емейл
    // TODO: переписать без вложенности, через проверку статуса https://gitlab.com/nicky000/mindcast/merge_requests/1#note_211732113
    if (data.token === '') {
      data.msg = 'Токен запроса отсутствует'
      data.status = 'TOKEN_EMPTY'
    } else {
      // находим какому пользователю соответствует токен
      const userInfo = await app.locals.db.collection('tokens').findOne({ token: data.token })
      if (userInfo) {
        // записываем новый пароль в пользователя,
        const upd = await app.locals.db.collection('users').updateOne({ email: userInfo.user }, { $set: { password: req.body.password } })
        if (upd.result.ok === 1) {
          // помечаем токен как использованный
          const tokenUpd = await app.locals.db.collection('tokens').updateOne({ token: data.token }, { $set: { isActive: false } })
          if (tokenUpd.result.ok === 1) {
            // логииним через пасспорт
            data.msg = `Пароль изменен на ${req.body.password}`
            data.status = 'PWD_UPD_OK'
            req.logIn(userInfo.user, err => {
              if (err) {
                data.msg = `Ошибка при авторизации пользователя: ${err}`
                data.status = 'LOGIN_OK'
                console.log('Ошибка залогинивания ', err)
                return next(err)
              }
              return res.redirect('/recovered')
            })
          }
        } else {
          data.msg = `Ошибка при обновлении пароля: ${upd.message}`
          data.status = 'PWD_UPD_ERR'
        }
      } else {
        data.msg = `Токен ${data.token} не найден в базе`
        data.status = 'NO_TOKEN'
      }
    }
  }
  // res.render('newPassword', data)
  // TODO: сделать глобальную функцию переопределяющую/восстанавливающую консоль.лог для запрета вывода в продакшене
  // http://qaru.site/questions/16981/how-to-quickly-and-conveniently-disable-all-consolelog-statements-in-my-code
  // ...или писать тесты
  // console.log(`Передан новый пароль: ${req.body.password}, событие ${data.status}`)
})

app.get('/recovered', auth, (req, res) => {
  res.render('recovered')
})

app.listen(3000, async () => {
  console.log('------ Приложение запущено на 3000 порту')
  await AppDB.connectDb(app)
})
