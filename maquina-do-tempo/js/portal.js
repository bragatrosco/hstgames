'use strict';
// Mantém os arquivos de progresso deste jogo separados dos demais jogos do portal.
(function () {
    var originalKey = StorageManager.webStorageKey;
    StorageManager.webStorageKey = function (id) {
        return 'hstgames:maquina-do-tempo:' + originalKey.call(this, id);
    };
})();
