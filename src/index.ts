import { createServer } from "http";
import { CNode, BeginningNode, CardType, GameController } from "./gameController";
import { Vec2 } from "./linearAlgebra";
import { v4 as getID } from "uuid";
import WebSocket from "ws";

function makeRoomID(length: number) {
    let result           = '';
    let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

type PlayerID = string;
type GameCode = string;

interface CommunicationPacket {
    t: string,
    d?: any
};

interface Room {
    players: { first: PlayerID, second?: PlayerID };
    code: GameCode;
    gameController: GameController;
    dataSenderInterval?: NodeJS.Timer;
};

interface Player {
    ws: WebSocket.WebSocket;
    inRoomID?: GameCode;
};

const port = process.env.PORT || 8080;

const httpServer = createServer((req, res) => {
    res.writeHead(418, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        'i am just': 'a teapot'
    }));
});
const wsServer = new WebSocket.WebSocketServer({ server: httpServer });

const connections: { [key: PlayerID]: Player; } = {};
const rooms: Room[] = [];

wsServer.on('connection', ws => {
    const playerID: PlayerID = getID();
    
    console.log('new connection; id: %s', playerID);
    connections[playerID] = { ws };

    ws.send(JSON.stringify({
        t: "connection-successful",
        d: { id: playerID }
    }));

    ws.on('message', data => {
        let msg: CommunicationPacket;

        try {
            msg = JSON.parse(data.toString());
            if (!msg.t) return;
        } catch (_) {
            ws.close();
            return;
        }

        console.log(msg);

        switch (msg.t) {
            case 'create-room': {
                if (!connections[playerID].inRoomID) {
                    const roomID = makeRoomID(8);
                    rooms.push({ gameController: new GameController(), code: roomID, players: { first: playerID } });
                    connections[playerID].inRoomID = roomID;
                    ws.send(JSON.stringify({ t: "create-room-success", d: { code: roomID } }));
                } else ws.send(JSON.stringify({ t: "create-room-fail", d: { reason: "Player already in room" } }));
                break;
            }
            case 'join-room': {
                if (!msg.d) {
                    ws.send(JSON.stringify({ t: "join-room-fail", d: { reason: "No code supplied" } }));
                    break;
                }

                const roomID: string | undefined = msg.d.code;
                const room = rooms.find(val => val.code == roomID);
                if (room !== undefined && roomID) {
                    if (Object.keys(room.players).length < 2 && room.players.first !== playerID) {
                        room.players.second = playerID;
                        connections[playerID].inRoomID = roomID;
                        ws.send(JSON.stringify({ t: "join-room-success", d: { code: connections[playerID].inRoomID } }));
                        connections[room.players.first].ws.send(JSON.stringify({ t: "room-begin", d: null }))
                        connections[room.players.second].ws.send(JSON.stringify({ t: "room-begin", d: null }))

                        room.dataSenderInterval = setInterval(() => {
                            connections[room.players.first].ws.send(JSON.stringify({
                                t: 'status',
                                d: {
                                    placedCards: room.gameController.placedCards,
                                    canPlace: !room.gameController.currentPlayer,
                                    playerDeck: room.gameController.p1Deck
                                }
                            }));
                            
                            if (room.players.second) {
                                let copy: BeginningNode<CardType>[] = [];
                                room.gameController.placedCards.forEach(e => {
                                    copy.push({
                                        val: e.val == CardType.STATE_0_1 ? CardType.STATE_1_0 : CardType.STATE_0_1,
                                        bottomNext: e.topNext,
                                        topNext: e.bottomNext
                                    });
                                });

                                connections[room.players.second].ws.send(JSON.stringify({
                                    t: 'status',
                                    d: {
                                        placedCards: copy,
                                        canPlace: !!room.gameController.currentPlayer,
                                        playerDeck: room.gameController.p2Deck
                                    }
                                }));
                            }
                        }, 250);
                    } else ws.send(JSON.stringify({ t: "join-room-fail", d: { reason: "Room full or user already joined" } }));
                } else ws.send(JSON.stringify({ t: "join-room-fail", d: { reason: "Room code is invalid" } }));
                break;
            }
            case 'leave-room': {
                const room = rooms.find(val => val.code == connections[playerID].inRoomID);
                if (room !== undefined) {
                    if (room.players.first === playerID || room.players.second === playerID) {
                        clearInterval(room.dataSenderInterval);

                        connections[room.players.first].ws.send(JSON.stringify({ t: "room-close", d: { reason: "One of the players left the room" } }))
                        connections[room.players.first].inRoomID = undefined;

                        if (room.players.second)
                        {
                            connections[room.players.second].ws.send(JSON.stringify({ t: "room-close", d: { reason: "One of the players left the room" } }))
                            connections[room.players.second].inRoomID = undefined;
                        }
                        
                        if (rooms.indexOf(room) > -1) {
                            rooms.splice(rooms.indexOf(room), 1);
                        }
                    } else ws.send(JSON.stringify({ t: "leave-room-fail", d: { reason: "Player already left room or wasn't in room at all" } }));
                } else ws.send(JSON.stringify({ t: "leave-room-fail", d: { reason: "Room code is invalid" } }));
                break;
            }
            case 'place-card': {
                const roomCode = connections[playerID].inRoomID;
                if (!roomCode) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "Player isn't in a room" }
                    }));
                    break;
                }
                const room = rooms.find(val => val.code == connections[playerID].inRoomID);
                if (!room) break;
                if (Object.keys(room.players).length < 2) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "Room hasn't begun" }
                    }));
                    break;
                }
                if (room.gameController.currentPlayer == 0 && room.players.second == playerID ||
                    room.gameController.currentPlayer == 1 && room.players.first == playerID) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "It isn't Player's turn" }
                    }));
                    break;
                }

                if (!msg.d) {
                    connections[playerID].ws.send(JSON.stringify({ t: 'place-card-fail', d: { reason: 'No deck idx supplied' } }))
                    break;
                }

                const deckIndex: number | undefined = msg.d.deckIdx;
                const pos: Vec2 | undefined = msg.d.pos;
                if (deckIndex === undefined || !pos) break;

                if (room.gameController.currentPlayer == 1 && room.players.second == playerID) pos.y = -pos.y;

                room.gameController.PlaceCardFromDeckIndex(deckIndex, pos, room.gameController.currentPlayer);
                break;
            }
            case 'discard-card': {
                const roomCode = connections[playerID].inRoomID;
                if (!roomCode) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "Player isn't in a room" }
                    }));
                    break;
                }
                const room = rooms.find(val => val.code == connections[playerID].inRoomID);
                if (!room) break;
                if (Object.keys(room.players).length < 2) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "Room hasn't begun" }
                    }));
                    break;
                }
                if (room.gameController.currentPlayer == 0 && room.players.second == playerID ||
                    room.gameController.currentPlayer == 1 && room.players.first == playerID) {
                    connections[playerID].ws.send(JSON.stringify({
                        t: 'place-card-fail',
                        d: { reason: "It isn't Player's turn" }
                    }));
                    break;
                }

                if (!msg.d) {
                    connections[playerID].ws.send(JSON.stringify({ t: 'place-card-fail', d: { reason: 'No deck idx supplied' } }))
                    break;
                }

                const deckIndex: number | undefined = msg.d.deckIdx;
                if (deckIndex === undefined) break;

                room.gameController.DiscardCard(deckIndex, room.gameController.currentPlayer);
                break;
            }
            case 'get-rooms': {
                let jsonRooms: GameCode[] = [];
                rooms.forEach(room => {
                    jsonRooms.push(room.code);
                });
                connections[playerID].ws.send(JSON.stringify({
                    "t": "get-rooms-success",
                    "d": jsonRooms
                }));
            }
        }
    });

    ws.on('close', (ws: WebSocket, code: number, reason: Buffer) => {
        console.log('closed connection; id: %s, reason: %s, code: %d', playerID, reason, code);
        let joinedRoom = rooms.find(e => e.players.first === playerID || e.players.second === playerID);
        if (joinedRoom) {
            connections[joinedRoom.players.first].ws.send(JSON.stringify({ t: "room-close", d: { reason: "One of the players disconnected from the server" } }))
            connections[joinedRoom.players.first].inRoomID = undefined;
            if (joinedRoom.players.second) {
                connections[joinedRoom.players.second].ws.send(JSON.stringify({ t: "room-close", d: { reason: "One of the players disconnected from the server" } }))
                connections[joinedRoom.players.second].inRoomID = undefined;
            }

            clearInterval(joinedRoom.dataSenderInterval);
            if (rooms.indexOf(joinedRoom) > -1) {
                rooms.splice(rooms.indexOf(joinedRoom), 1);
            }
        }

        delete connections[playerID];
    });
});

httpServer.listen(port);
console.log('listening');