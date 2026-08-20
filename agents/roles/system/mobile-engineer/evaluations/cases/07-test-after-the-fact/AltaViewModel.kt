class AltaViewModel(private val api: AltaApi) : ViewModel() {

    var documento by mutableStateOf("")
        private set
    var estado by mutableStateOf<Estado>(Estado.Idle)
        private set

    fun onDocumento(valor: String) { documento = valor }

    fun enviar() {
        estado = Estado.Enviando
        viewModelScope.launch {
            var intento = 0
            while (true) {
                try {
                    api.alta(documento)
                    estado = Estado.Exito
                    return@launch
                } catch (e: IOException) {
                    intento++
                    delay(1000)
                }
            }
        }
    }
}
