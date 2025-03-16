const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const { engine } = require('express-handlebars');
const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage(); 
const upload = multer({ storage });


const app = express();
const PORT = process.env.PORT || 4001;

// Configurar Handlebars correctamente
app.engine('hbs', engine({ extname: 'hbs' }));
app.set('view engine', 'hbs');

// Conectar con MySQL
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



// Crear usuario administrador por defecto si no existe
const emailAdmin = 'admin@gamy.com';
const passwordAdmin = 'admin123';

connection.query('SELECT * FROM usuariosAdmin WHERE email = ?', [emailAdmin], (err, results) => {
    if (err) throw err;
    if (results.length === 0) {
        const hashedPassword = bcrypt.hashSync(passwordAdmin, 10);
        connection.query('INSERT INTO usuariosAdmin (email, password) VALUES (?, ?)', [emailAdmin, hashedPassword], (err) => {
            if (err) throw err;
            console.log('✅ Usuario admin creado: admin@gamy.com / admin123');
        });
    }
});

// Configurar sesión
app.use(session({
    secret: 'secreto_admin',
    resave: false,
    saveUninitialized: true
}));


// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

// Configurar estrategia local con Passport
passport.use(new LocalStrategy({ usernameField: 'email' },
    (email, password, done) => {
        connection.query('SELECT * FROM usuariosAdmin WHERE email = ?', [email], (err, results) => {
            if (err) return done(err);
            if (results.length === 0) return done(null, false, { message: 'Usuario no encontrado' });

            const user = results[0];
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) return done(err);
                if (!isMatch) return done(null, false, { message: 'Contraseña incorrecta' });
                return done(null, user);
            });
        });
    }
));


passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    connection.query('SELECT * FROM usuariosAdmin WHERE id = ?', [id], (err, results) => {
        if (err) return done(err);
        if (!results.length) return done(null, false);
        done(null, results[0]);
    });
});

app.get('/', (req, res) => {
    res.render('login');
});


//ruta Login
app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.render('login', { error: 'Usuario o contraseña incorrectos' });

        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.redirect('/home');
        });
    })(req, res, next);
});


function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

app.get('/home', isAuthenticated, (req, res) => {
    res.render('home', { email: req.user.email });
});

app.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect('/');
    });
});


//Reportes de los paraderos

app.get('/view-reports', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM reportes', (err, results) => {
        if (err) return res.status(500).send('Error al obtener los reportes');
        res.render('reportes', { reports: results });
    });
});





app.get('/ver-reporte/:id', (req, res) => {
    const reportId = req.params.id;

    connection.query('SELECT * FROM reportes WHERE id = ?', [reportId], (err, results) => {
        if (err) {
            console.error('Error al obtener el reporte:', err);
            return res.status(500).send('Error al obtener el reporte');
        }
        if (results.length === 0) {
            return res.status(404).send('Reporte no encontrado');
        }

        const report = results[0]; 

        const location = report.location.split(',');
        const latitude = location[0];
        const longitude = location[1];


        res.render('ver-reporte', { report, latitude, longitude }); 
    });
});



app.get('/reportes/:id/image', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT image FROM reportes WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0 || !results[0].image) {
            return res.status(404).send('Imagen no encontrada');
        }

        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(results[0].image);
    });
});


app.post('/eliminar-reporte/:id', (req, res) => {
    const { id } = req.params;

    connection.query('DELETE FROM reportes WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Error al eliminar el reporte:', err);
            return res.status(500).send('Error al eliminar el reporte');
        }
        res.redirect('/view-reports'); 
    });
});


//reportes de camiones

app.get('/reporteCamiones', (req, res) => {
    connection.query('SELECT * FROM reportescamiones1', (err, reportes) => {
        if (err) {
            console.error('Error al obtener reportes de camiones:', err);
            return res.status(500).send('Error al obtener reportes');
        }
        res.render('adminReporteCamiones', { reportes });
    });
});



app.get('/imagen-reporte-camion/:id', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT foto FROM reportescamiones1 WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al obtener la imagen:', err);
            return res.status(500).send('Error al obtener la imagen');
        }
        if (results.length === 0 || !results[0].foto) {
            return res.status(404).send('Imagen no encontrada');
        }

        res.setHeader('Content-Type', 'image/png'); 
        res.send(results[0].foto);
    });
});



app.get('/ver-reporte-camion/:id', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT * FROM reportescamiones1 WHERE id = ?', [id], (err, reporte) => {
        if (err) {
            console.error('Error al obtener el reporte:', err);
            return res.status(500).send('Error al obtener el reporte');
        }
        if (reporte.length === 0) {
            return res.status(404).send('Reporte no encontrado');
        }

        res.render('verReporteCamion', { reporte: reporte[0] });
    });
});


app.post('/eliminar-reporte-camion/:id', (req, res) => {
    const { id } = req.params;

    connection.query('DELETE FROM reportescamiones1 WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Error al eliminar el reporte:', err);
            return res.status(500).send('Error al eliminar el reporte');
        }
        res.redirect('/reporteCamiones'); 
    });
});




//Usuarios

app.get('/usuarios', isAuthenticated, (req, res) => {
    connection.query('SELECT id, email FROM usuariosAdmin', (err, results) => {
        if (err) {
            console.error('Error al obtener los usuarios:', err);
            return res.status(500).send('Error al obtener los usuarios');
        }
        res.render('usuarios', { usuarios: results });
    });
});

app.get('/altaUsuarios', isAuthenticated, (req, res) => {
    res.render('altaUsuarios');
});


app.post('/altaUsuarios', isAuthenticated, (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Faltan campos');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    connection.query('INSERT INTO usuariosAdmin (email, password) VALUES (?, ?)', [email, hashedPassword], (err, results) => {
        if (err) {
            console.error('Error al guardar el usuario:', err);
            return res.status(500).send('Error al guardar el usuario');
        }

        res.redirect('/home'); 
    });
});


app.get('/editarUsuario/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    connection.query('SELECT * FROM usuariosAdmin WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error al obtener el usuario:', err);
            return res.status(500).send('Error al obtener el usuario');
        }
        res.render('editarUsuario', { usuario: results[0] });
    });
});

app.post('/eliminarUsuario/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    connection.query('DELETE FROM usuariosAdmin WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Error al eliminar el usuario:', err);
            return res.status(500).send('Error al eliminar el usuario');
        }
        res.redirect('/usuarios');
    });
});




app.post('/actualizarUsuario/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    let query = 'UPDATE usuariosAdmin SET email = ?';
    let params = [email];

    if (password) { // Si se ingresa una nueva contraseña, la actualiza
        const hashedPassword = bcrypt.hashSync(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(id);

    connection.query(query, params, (err) => {
        if (err) {
            console.error('Error al actualizar usuario:', err);
            return res.status(500).send('Error al actualizar usuario');
        }
        res.redirect('/usuarios');
    });
});



//noticias


app.get('/nuevaPubli', isAuthenticated, (req, res) => {
    res.render('nuevaPubli');
});

app.post('/publicar', isAuthenticated, upload.single('imagen'), (req, res) => {
    const { titulo, informacion } = req.body;
    
    if (!req.file) {
        return res.status(400).send('Error: No se subió ninguna imagen.');
    }

    const imagen = req.file.buffer; 

    connection.query('INSERT INTO noticias (titulo, informacion, imagen) VALUES (?, ?, ?)', 
        [titulo, informacion, imagen], (err) => {
            if (err) {
                console.error('Error al guardar la noticia:', err);
                return res.status(500).send('Error al guardar la noticia');
            }
            res.redirect('/home');
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



app.get('/noticias', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM noticias ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error('Error al obtener las noticias:', err);  
            return res.status(500).send('Error al obtener las noticias');
        }
        res.render('noticias', { reports: results });
    });
    
});



app.get('/nuevaPubli', isAuthenticated, (req, res) => {
    res.render('nuevaPubli');
});


app.get('/editarNoticia/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    connection.query('SELECT * FROM noticias WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).send('Error al obtener la noticia');
        if (results.length === 0) return res.status(404).send('Noticia no encontrada');
        res.render('editarNoticia', { noticia: results[0] });
    });
});



app.get('/eliminarNoticia/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    connection.query('DELETE FROM noticias WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).send('Error al eliminar la noticia');
        res.redirect('/noticias');
    });
});


app.post('/editarNoticia/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { titulo, informacion } = req.body;
    
    connection.query('UPDATE noticias SET titulo = ?, informacion = ? WHERE id = ?', 
    [titulo, informacion, id], (err) => {
        if (err) return res.status(500).send('Error al actualizar la noticia');
        res.redirect('/noticias');
    });
});



// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Admin corriendo en http://localhost:${PORT}`);
});
