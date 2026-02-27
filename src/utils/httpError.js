// CUANDO TRAABAJAMOS EN UNA API NECESITAMOS DEVOLVER ERRORES DE VARIOS TIPOS MENCIONANDO LO QUE PASO Y QUE CODIGO HTTP DEVOLVER

export class HttpError extends Error { // ESTAMOS CREANDO UN NUEVO TIPO DE ERROR, EXTENDS QUIERE DECIR QUE ESTE NUEVO ERROR SE BASA EN EL ERROR NORMAL DE JS
  constructor(status, message) { //el constructor es la funcion que se ejecuta 
    super(message); // constructor del error normal, sin esto el error no tendria mensaje 
    this.status = status; // aqui le agregamnos una propiedad nueva al error, ahora el error tieen error.status
  }
}