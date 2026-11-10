import { Router } from "express";
import { pool } from "../db";
import { PG_ERRORS } from "../utils";

export const userRouter = Router();
userRouter.get('/', async (req, res) => {
    const result = await pool.query('select * from users');
    res.json(result.rows);
})

userRouter.get('/:id/orders', async (req, res) => {
    const userId = Number(req.params.id);
    const result = await pool.query(`select * from orders where user_id=$1`, [userId]);
    res.json(result.rows)
})




userRouter.post('/add', async (req, res) => {
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