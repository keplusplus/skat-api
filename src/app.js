require('dotenv-safe').config()
const express = require('express')
const winston = require('winston')
const bodyParser = require('body-parser')
// const cors = require('cors')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const swaggerDocument = YAML.load('./reference/swagger.yaml')
const openapiValidator = require('express-openapi-validator')

const package = require('../package.json')

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: `${package.name}` },
    transports: [
        new winston.transports.File({ filename: `./logs/${package.name}-error.log`, level: 'error' }),
        new winston.transports.File({ filename: `./logs/${package.name}-combined.log` })
    ]
})

if(process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }))
}

const router = require('./router')(logger)

const app = express()
const port = process.env.PORT || 8080
const basePath = `/${package.name}/v${package.version.split('.')[0]}`

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} (${req.ip})`)
    next()
})

app.use(`${basePath}/swagger`, swaggerUi.serve)
app.get(`${basePath}/swagger`, swaggerUi.setup(swaggerDocument))

app.use(bodyParser.json())
// app.use(cors())

app.use(openapiValidator.middleware({
    apiSpec: './reference/swagger.yaml',
    validateRequests: true,
    validateResponses: true
}))

app.get('/', (req, res) => {
    res.send({ status: "up" })
})

app.use(basePath, router)

app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors,
    });
});

app.use('*', (req, res) => {
    res.status(404).send({
        status: 404,
        error: 'Not found'
    })
})

app.listen(port, () => logger.info(`Server listening on port ${port}...`))