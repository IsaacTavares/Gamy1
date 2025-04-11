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

//configurar multer para almacenar la imagen en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

app.engine('hbs', exphbs.engine({ extname: 'hbs' }));
app.set('view engine', 'hbs');

app.use(session({
    secret: 'secreto_super_seguro',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 60 * 60 * 1000  
    }
}));


app.use((req, res, next) => {
    if (req.session) {
        req.session.touch(); 
    }
    next();
});



//Middleware para servir archivos estáticos (IMÁGENES)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

//inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

//configurar express.urlencoded para procesar datos de formularios
app.use(express.urlencoded({ extended: true }));

//configuración de autenticación con Google
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

//rutas de autenticación con Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/home');
    }
);

//pagina principal con noticias
app.get('/home', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM noticias ORDER BY fecha DESC', (err, noticias) => {
        if (err) {
            console.error('Error al obtener noticias:', err);
            return res.status(500).send('Error al obtener noticias');
        }
        res.render('index', { user: req.user, noticias });
    });
});

//desarrollado por isaac tavares ponce

//cierre de sesión
app.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect('/');
    });
});

//Middleware de autenticación
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.send(`<h1>Bienvenido, ${req.user.name}</h1><a href='/logout'>Cerrar sesión</a>`);
});

//ruta de inicio
app.get('/', (req, res) => {
    res.render('login');
});

//ruta para reportes de paraderos
app.get('/reporteParada', (req, res) => {
    res.render('report');
});

//ruta para reportes de camión
app.get('/reporteCamion', (req, res) => {
    res.render('reporteCamion');
});


app.post('/reportParadero', upload.single('image'), (req, res) => {
    const { location, comment } = req.body;
    const image = req.file ? req.file.buffer : null; 

    if (!location || !comment || !image) {
        return res.status(400).json({ success: false, message: "Se requiere ubicación, comentario e imagen" });
    }

    connection.query(
        'INSERT INTO reportes (location, comment, image, estatus) VALUES (?, ?, ?, ?)',
        [location, comment, image, 'Enviado'],
        (err, results) => {
            if (err) {
                console.error('Error al guardar el reporte:', err);
                return res.status(500).json({ success: false, message: "Error al guardar el reporte" });
            }
            res.json({ success: true, message: "Reporte enviado con éxito" });
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
    const userId = req.user.id; 

    if (!nombre || !unidad || !ruta || !descripcion || !foto) {
        return res.status(400).send('Todos los campos son obligatorios');
    }

    const query = 'INSERT INTO reportescamiones1 (nombre, unidad, ruta, descripcion, foto, user_id, estatus) VALUES (?, ?, ?, ?, ?, ?, ?)';
    connection.query(query, [nombre, unidad, ruta, descripcion, foto, userId, 'Enviado'], (err) => {
        if (err) {
            console.error('Error al guardar el reporte de camión:', err);
            return res.status(500).send('Error al guardar el reporte');
        }
        res.redirect('/home'); 
    });
});


app.get('/misReportes', isAuthenticated, (req, res) => {
    const userId = req.user.id;

    connection.query('SELECT * FROM reportes WHERE user_id = ?', [userId], (err, reportesParaderos) => {
        if (err) {
            console.error('Error al obtener los reportes de paraderos:', err);
            return res.status(500).send('Error al obtener los reportes de paraderos');
        }

        console.log('Reportes de Paraderos:', reportesParaderos);
    
        connection.query('SELECT * FROM reportescamiones1 WHERE user_id = ?', [userId], (err, reportesCamiones) => {
            if (err) {
                console.error('Error al obtener los reportes de camiones:', err);
                return res.status(500).send('Error al obtener los reportes de camiones');
            }
    
            console.log('Reportes de Camiones:', reportesCamiones);
    
            res.render('misReportes', { 
                reportesParaderos,
                reportesCamiones
            });
        });
    });
    
});

//ruta para ver el reporte de camión específico
app.get('/ver-reporte/camion/:id', isAuthenticated, (req, res) => {
    const { id } = req.params; 

    connection.query('SELECT * FROM reportescamiones1 WHERE id = ?', [id], (err, resultados) => {
        if (err) {
            console.error('Error al obtener el reporte de camión:', err);
            return res.status(500).send('Error al obtener el reporte de camión');
        }
        if (resultados.length === 0) {
            return res.status(404).send('Reporte no encontrado');
        }

        const reporte = resultados[0];
        res.render('verReporteCamiones', { reporte });
    });
});


//ruta para obtener la imagen del reporte de camión
app.get('/imagenCamion/:id', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT foto FROM reportescamiones1 WHERE id = ?', [id], (err, resultados) => {
        if (err) {
            console.error('Error al obtener la imagen:', err);
            return res.status(500).send('Error al obtener la imagen');
        }
        if (resultados.length === 0 || !resultados[0].foto) {
            return res.status(404).send('Imagen no encontrada');
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(resultados[0].foto);
    });
});



//ruta para ver el reporte de paradero
app.get('/ver-reporte/paradero/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    connection.query('SELECT * FROM reportes WHERE id = ?', [id], (err, resultados) => {
        if (err) {
            console.error('Error al obtener el reporte:', err);
            return res.status(500).send('Error al obtener el reporte');
        }
        if (resultados.length === 0) {
            return res.status(404).send('Reporte no encontrado');
        }

        res.render('verReporteParaderos', { reporte: resultados[0] });
    });
});

//iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});


app.use(express.static('public'));
