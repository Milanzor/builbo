// Get command line options
const argv = require('minimist')(process.argv.slice(2));
const configFile = 'config' in argv ? argv.config : './builders.json';

// Start socket.io
const io = require('socket.io')();

// Get builders interface
const builder = require('./builders');

// Init
builder.initialize(configFile);

// Initial connection
io.on('connection', function (socket) {

    let currentBuilder = null;

    socket.emit('builder-list', builder.getBuilders());

    // Get builder details socket event
    socket.on('get-builder-details', function (data) {
        // Set current builder
        currentBuilder = data.builder_id;

        let builderDetails = builder.getBuilder(data.builder_id);
        socket.emit('builder-details', {builder: builderDetails, builder_id: data.builder_id});
    });

    // Attach log socket event
    socket.on('attach-log', function (data) {

        console.log(data);
        let builder_id = data.builder_id;
        let builderProcess = builder.getBuilderProcess(builder_id);

        if (builderProcess) {

            // Bind the log event
            builderProcess.on('log', function (data) {
                socket.emit('builder-log-line', {logLine: data.logLine, builder_id: builder_id});
            });
            builderProcess.on('builder-deactivated', function (data) {
                io.sockets.emit('builder-deactivated', {builder_id: data.builder_id});
            });
        } else {
            // Builder is deactivated, it failed to start
            io.sockets.emit('builder-deactivated', {builder_id: data.builder_id});
            socket.emit('builder-log-line', {logLine: 'Error attaching log, please check the Builly logs', builder_id: builder_id});
        }

    });

    // Flush all log lines to the frontend
    socket.on('fetch-log', function (data) {

        let builder_id = data.builder_id;
        let builderProcess = builder.getBuilderProcess(builder_id);

        if (builderProcess) {

            // Flush all log lines to the frontend
            if (builderProcess.log.length) {
                builderProcess.log.forEach(function (logLine) {
                    socket.emit('builder-log-line', {logLine: logLine, builder_id: builder_id, flush: true});
                });
            }
        }
    });

    // Activate builder socket event
    socket.on('activate-builder', function (data) {

        // Spawn the builder
        let builderResult = builder.spawnBuilder(data.builder_id);

        // Error check
        if (builderResult === true) {
            // All is fine
            io.sockets.emit('builder-activated', {builder_id: data.builder_id});
            return true;
        }

        // Error
        socket.emit('builder-error', {message: builderResult});
        io.sockets.emit('builder-deactivated', {builder_id: data.builder_id});

    });

    // Deactivate builder socket event
    socket.on('deactivate-builder', function (data) {
        if (builder.deactivateBuilder(data.builder_id)) {
            io.sockets.emit('builder-deactivated', {builder_id: data.builder_id});
        } else {
            socket.emit('builder-error', {message: 'Failed to deactivate builder. Builder not found.'});
        }
    });

    // Cleanup
    socket.on('disconnect', function () {
        socket.removeAllListeners(['get-builder-details', 'attach-log', 'activate-builder', 'deactivate-builder']);
    });

});

module.exports = io;
