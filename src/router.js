module.exports = (logger) => {

    const express = require('express')
    const router = express.Router()

    const mongodbAdapter = require('./mongodbAdapter')

    // Endpoints for all games (GET, POST)

    router.get('/games', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const data = await games.find().toArray()
        res.send(JSON.stringify(data))
    })

    router.post('/games', async (req, res) => {
        const game = {
            name: req.body.name,
            players: [],
            rounds: [],
            created: new Date(Date.now()).toISOString()
        }
        for(var i = 0; i < req.body.playerNames.length; i++) {
            game.players.push({
                id: i,
                name: req.body.playerNames[i],
                points: 0
            })
        }

        const games = await mongodbAdapter.getGamesCollection()
        const data = await games.insertOne(game)
        res.send(JSON.stringify(data.ops[0]))
    })

    // Endpoints for specific game (GET, PATCH, DELETE)

    router.get('/games/:id', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const data = await games.findOne(mongodbAdapter.getId(req.params.id))
        res.send(JSON.stringify(data))
    })

    router.patch('/games/:id', async (req, res) => {
        const patchData = { $set: req.body }
        const games = await mongodbAdapter.getGamesCollection()
        const data = await games.updateOne({ _id: mongodbAdapter.getId(req.params.id) }, patchData)
        res.send(JSON.stringify(await games.findOne(mongodbAdapter.getId(req.params.id))))
    })

    router.delete('/games/:id', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        await games.deleteOne({ _id: mongodbAdapter.getId(req.params.id) })
        res.sendStatus(204)
    })

    // Endpoints for all players of a game (GET, POST)

    router.get('/games/:id/players', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const game = await games.findOne(mongodbAdapter.getId(req.params.id))
        if(game) res.send(JSON.stringify(game.players))
        else res.sendStatus(400)
    })

    router.post('/games/:id/players', async(req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const game = await games.findOne(mongodbAdapter.getId(req.params.id))
        if(game) {
            const sorted = game.players.sort((a, b) => a.id < b.id)
            const data = await games.updateOne({ _id: mongodbAdapter.getId(req.params.id) }, {
                $push: {
                    "players": {
                        id: sorted.slice(-1).pop().id + 1,
                        name: req.body.name,
                        points: 0
                    }
                }
            })
            res.send(JSON.stringify(await games.findOne(mongodbAdapter.getId(req.params.id))))
            return
        }
        res.sendStatus(400)
    })

    // Endpoints for specific player of a game (GET, PATCH, DELETE)

    router.get('/games/:gid/players/:pid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        await games.aggregate([
            { $unwind: "$players" },
            { $match: { "_id": mongodbAdapter.getId(req.params.gid), "players.id": Number.parseInt(req.params.pid) } },
            { $replaceRoot: { newRoot: "$players" } }
        ]).toArray().then(array => {
            res.send(JSON.stringify(array[0]))
        })
    })

    router.patch('/games/:gid/players/:pid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()

        var updateObj = { $set: {} }
        if(req.body.name !== undefined) updateObj.$set['players.$.name'] = req.body.name
        if(req.body.points !== undefined) updateObj.$set['players.$.points'] = req.body.points

        await games.updateOne({
            "_id": mongodbAdapter.getId(req.params.gid),
            "players.id": Number.parseInt(req.params.pid)
        }, updateObj)

        await games.aggregate([
            { $unwind: "$players" },
            { $match: { "_id": mongodbAdapter.getId(req.params.gid), "players.id": Number.parseInt(req.params.pid) } },
            { $replaceRoot: { newRoot: "$players" } }
        ]).toArray().then(array => {
            res.send(JSON.stringify(array[0]))
        })
    })

    router.delete('/games/:gid/players/:pid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()

        await games.aggregate([
            {
                $match: { "_id": mongodbAdapter.getId(req.params.gid) },
            },
            {
                $project: { count: { $size: "$players" } }
            }
        ]).toArray().then(async array => {
            if(array[0].count <= 3) {
                res.status(400).send(JSON.stringify({
                    message: "A game cannot have less than 3 players",
                    errors: [
                        {
                            message: "A game cannot have less than 3 players",
                            errorCode: "game.min_players_violation"
                        }
                    ]
                }))
            } else {
                const data = await games.updateOne({ "_id": mongodbAdapter.getId(req.params.gid) }, {
                    $pull: {
                        "players": { "id": Number.parseInt(req.params.pid) }
                    }
                })
                data.result.ok === 1 ? res.sendStatus(204) : res.sendStatus(500)
            }
        })
    })

    // Endpoints for all rounds (GET, POST)

    router.get('/games/:id/rounds', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const game = await games.findOne(mongodbAdapter.getId(req.params.id))
        if(game) res.send(JSON.stringify(game.rounds))
        else res.sendStatus(400)
    })

    router.post('/games/:id/rounds', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const maxIdResult = await games.aggregate([{ $unwind: "$rounds" },
                                                   { $match: { "_id": mongodbAdapter.getId(req.params.id) } },
                                                   { "$group": { "_id": "$_id", "maxId": { "$max": "$rounds.id" } } }]).toArray()
        const newId = maxIdResult[0] ? Number.parseInt(maxIdResult[0].maxId) + 1 : 0
        await games.updateOne({ "_id": mongodbAdapter.getId(req.params.id) }, {
            $push: {
                "rounds": {
                    id: newId,
                    games: [
                        { id: 0 },
                        { id: 1 },
                        { id: 2 }
                    ],
                    inserted: new Date(Date.now()).toISOString()
                }
            }
        })
        const newRound = await games.aggregate([ { $unwind: "$rounds" }, { $match: { "_id": mongodbAdapter.getId(req.params.id), "rounds.id": newId } }, { $replaceRoot: { newRoot: "$rounds" } } ]).toArray()
        res.send(JSON.stringify(newRound[0]))
    })

    // Endpoints for a specific round (GET, DELETE)

    router.get('/games/:gid/rounds/:rid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        await games.aggregate([
            { $unwind: "$rounds" },
            { $match: { "_id": mongodbAdapter.getId(req.params.gid), "rounds.id": Number.parseInt(req.params.rid) } },
            { $replaceRoot: { newRoot: "$rounds" } }
        ]).toArray().then(array => {
            res.send(JSON.stringify(array[0]))
        })
    })  

    router.delete('/games/:gid/rounds/:rid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        await games.updateOne({ "_id": mongodbAdapter.getId(req.params.gid) }, {
            $pull: {
                "rounds": { "id": Number.parseInt(req.params.rid) }
            }
        })
        res.sendStatus(204)
    })

    // Endpoints for a specific round game of a around (PUT)

    router.put('/games/:gid/rounds/:rid/games/:rgid', async (req, res) => {
        const games = await mongodbAdapter.getGamesCollection()
        const result = await games.updateOne({ "_id": mongodbAdapter.getId(req.params.gid), "rounds.id": Number.parseInt(req.params.rid) }, {
            $pull: {
                "rounds.$.games": { "id": Number.parseInt(req.params.rgid) }
            }
        })
        if(result.result.nModified < 1) {
            res.sendStatus(204)
            return
        }
        await games.updateOne({ "_id": mongodbAdapter.getId(req.params.gid), "rounds.id": Number.parseInt(req.params.rid) }, {
            $push: {
                "rounds.$.games": {
                    "id": Number.parseInt(req.params.rgid),
                    "value": req.body.value,
                    "playerId": req.body.playerId,
                    "won": req.body.won,
                    "updated": new Date(Date.now()).toISOString()
                }
            }
        })

        await games.aggregate([
            { $unwind: "$rounds" },
            { $match: { "_id": mongodbAdapter.getId(req.params.gid), "rounds.id": Number.parseInt(req.params.rid) } },
            { $replaceRoot: { newRoot: "$rounds" } }
        ]).toArray().then(array => {
            res.send(JSON.stringify(array[0]))
        })
    })

    return router

}