const { Client } = require("pg");

const client = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "ivr_project"
});

client.on("connect", () => {
    console.log("Database connected.");
});

client.on("end", () => {
    console.log("Database Disconnected.");
});

client.connect();

module.exports = client;

// client.query(`select *,similarity(name,$1) from newspaper_article order by similarity desc limit 1;`,['school demolished in mysore'],(err,result) => {
//     if(err){
//       console.log(err);
//     }
//     else{
//         console.log(result.rows[0].similarity);
//         console.log(result.rows[0].name);
//     }
//     client.end();
// });

