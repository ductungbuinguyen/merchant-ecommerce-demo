require('dotenv').config();
const express = require('express')

const app = express()

const cors = require('cors');

app.use(cors())

const productRouter = require('./routes/productRoute.js')
const createOrderRouter = require('./routes/createOrderRoute.js')

app.use('/api/products', productRouter)
app.use('/api/create_order', createOrderRouter)

const PORT = 5000

app.listen(PORT, () => console.log(`Server started in port ${PORT}`))