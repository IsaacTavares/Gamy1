require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mysql = require('mysql2');
const { engine } = require('express-handlebars');

const app = express();
const PORT = 3000;

app.engine('hbs', engine({
    extname: '.hbs' 
}));
app.set('view engine', 'hbs');
app.set('views', './views');

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Configurar Google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Ruta de autenticación con Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Ruta de callback después de autenticación
app.get('/auth/google/callback', passport.authenticate('google', { 
    successRedirect: '/dashboard',
    failureRedirect: '/' 
}));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }

    // Renderiza la vista de inicio, pasando el nombre del usuario
    res.render('home', { 
        mensaje: `Bienvenido ${req.user.displayName}`,
        isAuthenticated: true
    });
});

// Ruta del cierre de sesion
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.send('<h1>Inicio</h1> <a href="/auth/google">Iniciar sesión con Google</a>');
});

// se inicia el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Configurar la conexión a la base de datos
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'reportes'
});

connection.connect(err => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err.stack);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

// Ruta para ver los reportes
app.get('/view-reports', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }

    connection.query('SELECT * FROM reportes', (err, results) => {
        if (err) {
            console.error('Error al obtener los reportes:', err);
            return res.status(500).send('Error al obtener los reportes');
        }

        res.render('reportes', { reports: results });
    });
});

app.get('/admin/reportes', (req, res) => {
    connection.query('SELECT * FROM reportes ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error('Error al obtener los reportes:', err);
            return res.status(500).send('Error al obtener los reportes');
        }
        res.render('reportes', { reportes: results });
    });
});
