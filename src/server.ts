import express from "express";
import { pool } from "./db";
import { PG_ERRORS } from "./utils";
import { z } from 'zod';
import { ordersRouter } from "./routes/order";
import { userRouter } from "./routes/users";

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
app.use('/orders', ordersRouter)
app.use('/users', userRouter)


app.listen(3000, () => {
    console.log("server is running at 3000");
})

