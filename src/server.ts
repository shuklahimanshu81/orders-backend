import express from "express";
import { pool } from "./db";
import { PG_ERRORS } from "./utils";
import { z } from 'zod';

const createOrderSchema = z.object({
    userId: z.number().int().positive(),
    symbol: z.string().trim().min(1),
    quantity: z.number().int().positive(),
    price: z.number().positive()
})

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: 'ok' })
})

app.get('/users', async (req, res) => {
    const result = await pool.query('select * from users');
    res.json(result.rows);
})

app.get('/user/:id/orders', async (req, res) => {
    const userId = Number(req.params.id);
    const result = await pool.query(`select * from orders where user_id=$1`, [userId]);
    res.json(result.rows)
})




app.post('/user', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('insert into users (name) values ($1) returning *', [name]);
        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        if (error.code === PG_ERRORS.NOT_NULL_VIOLATION) {
            return res.status(400).json({ error: "Please provide name of the user" });
        }
        res.status(500).json({ error: 'something went wrong. Please try after sometimes.' })
    }
})


app.listen(3000, () => {
    console.log("server is running at 3000");
})

