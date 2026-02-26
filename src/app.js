import express from "express"; // traemos a la herramienta que nos permite crear un servidor, esta es la que va a recibir peticiones 
import simulacroRouter from "./routes/simulacro.js" // aqui lo que hacemos es llamar al minirecepcionista, que nos ayudara a organizar 

const app = express(); // crreamos con express un servidor principal 
app.use(express.json()); // cuando alguien me mande datos typi json, conviertelos en algo que yo pueda usar


app.get("/health",(req, res)=> res.json({ok:true})); // creamos una ruta para validar que el servicio este activo y este funcionando 

app.use("/api/simulacro", simulacroRouter); // aqui damos una orden y es que todo lo que termine en simulacro sera enviado al minirecepcionista router quien le indicara hasta el momento que si esta funcionando 

export default app; // exportamos por default a app