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

// app.post('/order', async (req, res) => {

//     const key = req.header('Idempotency-Key');
//     if (!key) {
//         return res.status(400).json({ error: 'Idempotency Key header is required.' })
//     }
//     const parsed = createOrderSchema.safeParse(req.body)
//     if (!parsed.success) {
//         return res.status(400).json({ error: parsed.error.issues })
//     }
//     const { userId, symbol, quantity, price } = parsed.data
//     try {
//         const result = await pool.query('insert into orders  (user_id, symbol, quantity, price, idempotency_key) values ($1, $2, $3, $4, $5) on conflict (idempotency_key) do nothing returning *', [userId, symbol, quantity, price, key]);
//         if (result.rows.length > 0) {
//             return res.status(201).json(result.rows[0])
//         }
//         const existing = await pool.query('select * from orders where idempotency_key = $1', [key])
//         const order = existing.rows[0];

//         const sameRequest =
//             order.user_id === userId &&
//             order.symbol === symbol &&
//             order.quantity === quantity &&
//             Number(order.price) === price;

//         if (!sameRequest) {
//             return res.status(409).json({
//                 error: "Idempotency-Key was already used with a different request",
//             });
//         }

//         return res.status(200).json(order);
//     } catch (error: any) {
//         if (error.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) {
//             return res.status(400).json({ error: "User does not exist" });
//         }
//         if (error.code === PG_ERRORS.NOT_NULL_VIOLATION) {
//             return res.status(400).json({ error: "Please provide all the values" });
//         }

//         res.status(500).json({ error: "Something went wrong" });
//     }
// })

app.post('/order', async (req, res) => {
    // step 1 check the unique key, if not available in the header return error
    const key = req.header('Idempotency-Key');
    if (!key) {
        return res.status(400).json({ error: 'Idempotency Key header is required.' })
    }
    // step 2 check the data is right or not, if so return error
    const parsed = createOrderSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues })
    }
    // step 3 parse the data from the data
    const { userId, symbol, quantity, price } = parsed.data

    // step 4 borrow a connection, so that you run whole transaction on the same connection
    const client = await pool.connect();
    try {
        // step 5 start the transaction and insert the orders
        await client.query('begin');
        const inserted = await client.query("insert into orders user_id, symbol, quantity, price, idempotency_key", [userId, symbol, quantity, price, key]);
        
        // step 6 if nothing is inserted then rollback and response with existing data
        if (inserted.rows.length === 0) {
            await client.query("rollback");
            const existing = await pool.query(
                "select * from orders where idempotency_key = $1",
                [key]
            );
            return res.status(200).json(existing.rows[0]);
        }
        // step 7 calculate require amount if available in balance then deduct else rollback and return insufficient balance error.  
        const paid = await client.query("update users set balance = balance - ($2::numeric * $3::numeric) where id = $1 and balance >= ($2::numeric * $3::numeric)", [userId, quantity, price]);
        
        if (paid.rowCount === 0) {
            await client.query("rollback");
            return res.status(400).json({ error: "Insufficient Balance" });
        }
        // step 8 if all goes through then commit the transaction and response with the newly added order

        await client.query("commit");
        return res.status(201).json(inserted.rows[0]);
    } catch (error) {
       // error step : in case of any unprecedented error just rollback whole thing and response with error
        await client.query("rollback");
        if (error.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) {
            return res.status(400).json({ error: "User does not exist" });
        }
        console.error(error);
        res.status(500).json({ error: "Something went wrong" });
    } finally {
        // finally release the connection that you acquired, regardless of transaction goes through or not.
        client.release()
    }
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

