import express, { ErrorRequestHandler } from 'express'
import { config } from './cam'

const app = express()

app.get('/camConfig', (_, res) => {
    return res.status(200).send(config);
})

app.listen(3015, '127.0.0.1', () => {

})