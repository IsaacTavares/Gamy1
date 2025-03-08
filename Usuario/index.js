require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 4000;

// Configurar Handlebars
app.engine('hbs', engine({ extname: '.hbs' }));
app.set('view engine', 'hbs');
app.set('views', './views');

// Middleware para leer formularios
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Servir archivos estáticos (CSS, JS)
app.use(express.static('public'));

// Configura la conexión a la base de datos
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

// Ruta principal con botón para reportar
app.get('/', (req, res) => {
    res.render('index');
});

// Ruta para mostrar formulario de reporte
app.get('/report', (req, res) => {
    res.render('report');
});

// Ruta para recibir el reporte y enviarlo al administrador
app.post('/send-report', (req, res) => {
    const { location, comment } = req.body;

    console.log(`📍 Reporte recibido:\nUbicación: ${location}\nComentario: ${comment}`);

    // Inserta el reporte en la base de datos
    connection.query('INSERT INTO reportes (location, comment) VALUES (?, ?)', [location, comment], (err, results) => {
        if (err) {
            console.error('Error al guardar el reporte:', err);
            return res.status(500).send('Error al guardar el reporte');
        }

        // Verifica si la inserción fue exitosa
        if (results.affectedRows > 0) {
            console.log(`Reporte guardado con ID: ${results.insertId}`);
            res.redirect('/');
        } else {
            console.error('No se insertó ningún reporte');
            res.status(500).send('No se insertó el reporte');
        }
    });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
