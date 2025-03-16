require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const mysql = require('mysql2');
const exphbs = require('express-handlebars');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;



// Configurar multer para almacenar la imagen en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configurar la base de datos

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'gamy'
});
connection.connect(err => {
    if (err) {
        console.error('Error al conectar con MySQL:', err.stack);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

// Configura Handlebars como motor de plantillas
app.engine('hbs', exphbs.engine({ extname: 'hbs' }));
app.set('view engine', 'hbs');

// Configurar sesión
app.use(session({
    secret: 'secreto_super_seguro',
    resave: false,
    saveUninitialized: false
}));

// Middleware para servir archivos estáticos (IMÁGENES)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Configurar express.urlencoded para procesar datos de formularios
app.use(express.urlencoded({ extended: true }));

// Configuración de autenticación con Google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
    const { id, displayName, emails } = profile;
    const email = emails[0].value;

    connection.query('SELECT * FROM usuariosUsuario WHERE google_id = ?', [id], (err, results) => {
        if (err) return done(err);
        if (results.length > 0) return done(null, results[0]);

        const newUser = { google_id: id, name: displayName, email };
        connection.query('INSERT INTO usuariosUsuario SET ?', newUser, (err) => {
            if (err) return done(err);
            return done(null, newUser);
        });
    });
}));

passport.serializeUser((user, done) => {
    done(null, user.google_id);
});

passport.deserializeUser((id, done) => {
    connection.query('SELECT * FROM usuariosUsuario WHERE google_id = ?', [id], (err, results) => {
        if (err) return done(err);
        done(null, results[0]);
    });
});

// Rutas de autenticación con Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/index');
    }
);

// Página principal con noticias
app.get('/index', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM noticias ORDER BY fecha DESC', (err, noticias) => {
        if (err) {
            console.error('Error al obtener noticias:', err);
            return res.status(500).send('Error al obtener noticias');
        }
        res.render('index', { user: req.user, noticias });
    });
});

// Logout
app.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// Middleware de autenticación
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

// Dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.send(`<h1>Bienvenido, ${req.user.name}</h1><a href='/logout'>Cerrar sesión</a>`);
});

// Ruta de inicio
app.get('/', (req, res) => {
    res.render('login');
});

// Ruta para reportes de paraderos
app.get('/report', (req, res) => {
    res.render('report');
});

// Ruta para reportes de camión
app.get('/reporteCamion', (req, res) => {
    res.render('reporteCamion');
});


app.post('/reportParadero', upload.single('image'), (req, res) => {
    const { location, comment } = req.body;
    const image = req.file ? req.file.buffer : null; 

    if (!location || !comment || !image) {
        return res.status(400).send('Se requiere ubicación, comentario e imagen');
    }

    connection.query(
        'INSERT INTO reportes (location, comment, image) VALUES (?, ?, ?)',
        [location, comment, image],
        (err, results) => {
            if (err) {
                console.error('Error al guardar el reporte:', err);
                return res.status(500).send('Error al guardar el reporte');
            }
            res.redirect('/report');
        }
    );
});


app.get('/imagen/:id', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT imagen FROM noticias WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al obtener la imagen:', err);
            return res.status(500).send('Error al obtener la imagen');
        }
        if (results.length === 0 || !results[0].imagen) {
            return res.status(404).send('Imagen no encontrada');
        }

        res.setHeader('Content-Type', 'image/png'); 
        res.send(results[0].imagen);
    });
});


app.post('/guardar-reporte-camion', upload.single('foto'), (req, res) => {
    const { nombre, unidad, ruta, descripcion } = req.body;
    const foto = req.file ? req.file.buffer : null; 

    if (!nombre || !unidad || !ruta || !descripcion || !foto) {
        return res.status(400).send('Todos los campos son obligatorios');
    }

    const query = 'INSERT INTO reportescamiones1 (nombre, unidad, ruta, descripcion, foto) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [nombre, unidad, ruta, descripcion, foto], (err) => {
        if (err) {
            console.error('Error al guardar el reporte de camión:', err);
            return res.status(500).send('Error al guardar el reporte');
        }
        res.redirect('/index'); 
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
