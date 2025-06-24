require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 3000;


app.use(express.json());
app.use('/uploads', express.static('uploads')); // Para servir las imágenes

// Configuración de Multer para guardar fotos de asistencia
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    },
});

const upload = multer({ storage });

const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
});

// Registro de usuarios
app.post('/registrar', (req, res) => {
    const { nombre, apellido, tipo, grado, seccion, turno, nivel, numero, email, contrasena } = req.body;

    db.query('INSERT INTO usuarios SET ?', {
        nombre, apellido, tipo, grado, seccion, turno, nivel, numero, email, contrasena
    }, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: result.insertId });
    });
});

// Login de usuarios
app.post('/login', (req, res) => {
    const { email, contrasena } = req.body;

    db.query(
        'SELECT id, tipo FROM usuarios WHERE email = ? AND contrasena = ?',
        [email, contrasena],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            if (results.length > 0) {
                res.json({ success: true, tipo: results[0].tipo, id: results[0].id });
            } else {
                res.status(401).json({ error: 'Credenciales incorrectas' });
            }
        }
    );
});

// Registrar asistencia con foto o justificante
app.post('/asistencia', upload.single('archivo'), (req, res) => {
    const { usuario_id, fecha, hora, estado, motivo } = req.body;
    const archivoPath = req.file ? req.file.filename : '';

    db.query(
        'INSERT INTO asistencia (usuario_id, fecha, hora, estado, motivo, archivo) VALUES (?, ?, ?, ?, ?, ?)',
        [usuario_id, fecha, hora, estado, motivo || null, archivoPath],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, archivo: archivoPath });
        }
    );
});

// Historial por usuario
app.get('/historial/:usuario_id', (req, res) => {
    const { usuario_id } = req.params;
    db.query(
        'SELECT fecha, hora, estado, motivo, archivo FROM asistencia WHERE usuario_id = ? ORDER BY id DESC',
        [usuario_id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            const historial = results.map(row => {
                const item = {
                    fecha: row.fecha,
                    hora: row.hora,
                    estado: row.estado,
                };

                if (row.estado === 'Falta Justificada') {
                    item['justificante'] = row.archivo;
                    item['motivo'] = row.motivo;
                } else {
                    item['foto'] = row.archivo;
                }

                return item;
            });

            res.json(historial);
        }
    );
});

// Obtener usuarios (excepto directora)
app.get('/usuarios', (req, res) => {
    db.query(
        'SELECT id, CONCAT(nombre, " ", apellido) AS nombre_completo FROM usuarios WHERE tipo != "directora"',
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

// Historial completo con nombre y apellido
app.get('/historial-completo', (req, res) => {
    const sql = `
        SELECT a.fecha, a.hora, a.estado, a.motivo, a.archivo, 
               u.nombre, u.apellido, u.id as usuario_id
        FROM asistencia a
        JOIN usuarios u ON u.id = a.usuario_id
        ORDER BY a.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const historial = results.map(row => {
            const item = {
                fecha: row.fecha,
                hora: row.hora,
                estado: row.estado,
                nombre_completo: `${row.nombre} ${row.apellido}`,
                usuario_id: row.usuario_id
            };

            if (row.estado === 'Falta Justificada') {
                item['justificante'] = row.archivo;
                item['motivo'] = row.motivo;
            } else {
                item['foto'] = row.archivo;
            }

            return item;
        });

        res.json(historial);
    });
});

db.connect((err) => {
    if (err) {
        console.error('Error de conexión a MySQL:', err.message);
        process.exit(1); // Detiene la app si falla
    }
    console.log('Conexión a MySQL exitosa');
});


app.listen(port, '0.0.0.0', () => console.log(`Servidor API corriendo en puerto ${port}`));
