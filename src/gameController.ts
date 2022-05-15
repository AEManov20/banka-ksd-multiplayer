import { Vec2, Rect } from "./linearAlgebra";

enum CardType {
    STATE_0_1, STATE_1_0,
    AND_0, AND_1,
    OR_0, OR_1,
    XOR_0, XOR_1,
    EMPTY
};

interface CNode<T> {
    next?: CNode<T>;
    val: T;
};

interface BeginningNode<T> {
    topNext?: CNode<T>;
    bottomNext?: CNode<T>;
    val: T;
};

enum Turn {
    PLAYER_ONE,
    PLAYER_TWO
};

function shuffle<T>(array: T[]) {
    let currentIndex = array.length, randomIndex: number;
  
    while (currentIndex > 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
    
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

function GetRandomValue(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
}

class GameController {
    private globalDeck: CardType[];

    private playerDecks: CardType[][];

    private cards: BeginningNode<CardType>[];
    private currentTurn: Turn;

    constructor() {
        this.globalDeck = [];
        this.playerDecks = [ [], [] ];
        this.cards = [];

        this.currentTurn = GetRandomValue(0, 1);

        for (let i = 0; i < 6; i++) {
            this.cards.push({ val: GetRandomValue(0, 1) ?
                CardType.STATE_0_1 : CardType.STATE_1_0 });
        }

        this.FillGlobalDeck();
        this.FillDeck(this.playerDecks[0]);
        this.FillDeck(this.playerDecks[1]);
    }

    FillGlobalDeck() {
        const logicCards = [
            CardType.AND_0, CardType.AND_1,
            CardType.OR_0, CardType.OR_1,
            CardType.XOR_0, CardType.XOR_1
        ];

        logicCards.forEach(type => {
            for (let i = 0; i < 8; i++) {
                this.globalDeck.push(type);
            }
        });

        this.globalDeck = shuffle(this.globalDeck);
    }

    DiscardCard(deckIndex: number, player: Turn) {
        if (deckIndex > this.playerDecks[player].length || player != this.currentTurn)
            return;

        this.currentTurn = this.currentTurn == Turn.PLAYER_TWO ?
            Turn.PLAYER_ONE : Turn.PLAYER_TWO;
        
        const chosenCard = this.playerDecks[player][deckIndex];

        const idx = this.playerDecks[player].indexOf(chosenCard);
        if (idx > -1) {
            this.playerDecks[player].splice(idx, 1);
        }

        if (this.playerDecks[player].length < 5)
            this.AddOneToDeck(this.playerDecks[player]);
        
        if (this.globalDeck.length == 0)
            this.FillGlobalDeck();
    }

    AddOneToDeck(deckRef: CardType[]) {
        deckRef.push(this.globalDeck[this.globalDeck.length - 1]);
        this.globalDeck.pop();
        
        if (this.globalDeck.length == 0) {
            this.FillGlobalDeck();
        }
    }

    FillDeck(deckRef: CardType[]) {
        while (deckRef.length != 5)
        {
            this.AddOneToDeck(deckRef);
        }
    }

    PlaceCard(type: CardType, cardPos: Vec2): void {
        if (type === CardType.STATE_0_1 || type === CardType.STATE_1_0)
            return;
        
        if (this.CanPlaceCard(cardPos)) {
            if (this.CanPlaceCard({ x: cardPos.x, y: cardPos.y + (cardPos.y > 0 ? -1 : 1) }) ||
                this.CanPlaceCard({ x: cardPos.x + 1, y: cardPos.y + (cardPos.y > 0 ? -1 : 1) }))
                return;
            
            this.currentTurn = this.currentTurn == Turn.PLAYER_TWO ?
                Turn.PLAYER_ONE : Turn.PLAYER_TWO;
            
            let card: CNode<CardType> | undefined;

            if (cardPos.y < 0)
                card = this.cards[cardPos.x - cardPos.y].bottomNext;
            else if (cardPos.y > 0)
                card = this.cards[cardPos.x + cardPos.y].topNext;
            
            if (card === undefined) {
                if (cardPos.y < 0) {
                    this.cards[cardPos.x - cardPos.y].bottomNext = {
                        next: undefined,
                        val: type,
                    };
                } else if (cardPos.y > 0) {
                    this.cards[cardPos.x + cardPos.y].topNext = {
                        next: undefined,
                        val: type,
                    };
                }

                return;
            }

            while (card.next !== undefined)
                card = card.next;
            
            card.next = {
                next: undefined,
                val: type
            };
        }
    }

    PlaceCardFromDeckIndex(deckIndex: number, cardPos: Vec2, player: Turn): void {
        if (deckIndex > this.playerDecks[player].length || player != this.currentTurn ||
           (player == Turn.PLAYER_ONE && cardPos.y > 0) || (player == Turn.PLAYER_TWO && cardPos.y < 0))
            return;
        
        const placeableCards = this.GetPlaceableCards(cardPos);

        const chosenCard = this.playerDecks[player][deckIndex];

        if (placeableCards.find((val) => val == chosenCard) !== undefined)
        {
            const idx = this.playerDecks[player].indexOf(chosenCard);
            if (idx > -1) {
                this.playerDecks[player].splice(idx, 1);
            }

            this.PlaceCard(chosenCard, cardPos);
        }

        if (this.playerDecks[player].length < 5)
            this.AddOneToDeck(this.playerDecks[player]);
    }

    GetPlaceableCards(cardPos: Vec2): CardType[] {
        if ((this.CanPlaceCard({ x: cardPos.x, y: cardPos.y + (cardPos.y > 0 ? -1 : 1) }) ||
            this.CanPlaceCard({ x: cardPos.x + 1, y: cardPos.y + (cardPos.y > 0 ? -1 : 1) })) && !this.CanPlaceCard(cardPos))
            return [];

        let mostLeft: CardType;
        let mostRight: CardType;

        if (cardPos.y < 0) {
            mostLeft = this.GetCard({ x: cardPos.x, y: cardPos.y + 1 });
            mostRight = this.GetCard({ x: cardPos.x + 1, y: cardPos.y + 1 });
        } else if (cardPos.y > 0) {
            mostLeft = this.GetCard({ x: cardPos.x, y: cardPos.y - 1 });
            mostRight = this.GetCard({ x: cardPos.x + 1, y: cardPos.y - 1 });
        } else return [];

        let mostLeftState: boolean = false;
        let mostRightState: boolean = false;

        switch (mostLeft) {
            case CardType.STATE_0_1:
                if (cardPos.y > 0)
                    mostLeftState = true;
                else if (cardPos.y < 0)
                    mostLeftState = false;
                break;
            case CardType.STATE_1_0:
                if (cardPos.y > 0)
                    mostLeftState = false;
                else if (cardPos.y < 0)
                    mostLeftState = true;
                break;
            case CardType.AND_0:
                mostLeftState = false;
                break;
            case CardType.AND_1:
                mostLeftState = true;
                break;
            case CardType.OR_0:
                mostLeftState = false;
                break;
            case CardType.OR_1:
                mostLeftState = true;
                break;
            case CardType.XOR_0:
                mostLeftState = false;
                break;
            case CardType.XOR_1:
                mostLeftState = true;
                break;
            default: return [];
        }

        switch (mostRight) {
            case CardType.STATE_0_1:
                if (cardPos.y > 0)
                    mostRightState = true;
                else if (cardPos.y < 0)
                    mostRightState = false;
                break;
            case CardType.STATE_1_0:
                if (cardPos.y > 0)
                    mostRightState = false;
                else if (cardPos.y < 0)
                    mostRightState = true;
                break;
            case CardType.AND_0:
                mostRightState = false;
                break;
            case CardType.AND_1:
                mostRightState = true;
                break;
            case CardType.OR_0:
                mostRightState = false;
                break;
            case CardType.OR_1:
                mostRightState = true;
                break;
            case CardType.XOR_0:
                mostRightState = false;
                break;
            case CardType.XOR_1:
                mostRightState = true;
                break;
            default: return [];
        }

        let placeablePos: CardType[] = [];

        if (mostRightState && mostLeftState)
            placeablePos = [ CardType.AND_1, CardType.OR_1, CardType.XOR_0 ];
        else if ((mostRightState && !mostLeftState) || (!mostRightState && mostLeftState))
            placeablePos = [ CardType.AND_0, CardType.OR_1, CardType.XOR_1 ];
        else placeablePos = [ CardType.AND_0, CardType.OR_0, CardType.XOR_0 ];

        if (cardPos.y == this.cards.length - 1)
        {
            let initialRightState = this.GetCard({ x: 0, y: 0 }) == CardType.STATE_0_1 ? true : false;
            return placeablePos.filter((val) => initialRightState ? val % 2 != 0 : val % 2 == 0);
        }
        else if (cardPos.y == -(this.cards.length - 1))
        {
            let initialRightState = this.GetCard({ x: this.cards.length - 1, y: 0 }) == CardType.STATE_0_1 ? false : true;
            return placeablePos.filter((val) => initialRightState ? val % 2 != 0 : val % 2 == 0);
        }

        return placeablePos;
    }
    
    CanPlaceCard(cardPos: Vec2): boolean {
        let currentNode: CNode<CardType> | undefined;

        if (cardPos.y == 0 || cardPos.x < 0)
            return false;
        
        if (cardPos.y >= this.cards.length || cardPos.x >= this.cards.length - Math.abs(cardPos.y))
            return false;

        if (cardPos.y > 0)
            currentNode = this.cards[cardPos.x + cardPos.y].topNext;
        else if (cardPos.y < 0)
            currentNode = this.cards[cardPos.x - cardPos.y].bottomNext;
        
        for (let y = 1; y <= Math.abs(cardPos.y); y++) {
            if (currentNode === undefined) {
                if (Math.abs(cardPos.y) == y)
                    return true;
                return false;
            }

            currentNode = currentNode.next;
        }

        return false;
    }

    GetCard(cardPos: Vec2): CardType {
        let currentNode: CNode<CardType> | undefined;

        if (cardPos.x < 0)
            return CardType.EMPTY;
        
        if (cardPos.y >= this.cards.length || cardPos.x >= this.cards.length - Math.abs(cardPos.y))
            return CardType.EMPTY;

        if (cardPos.y > 0)
            currentNode = this.cards[cardPos.x + cardPos.y].topNext;
        else if (cardPos.y < 0)
            currentNode = this.cards[cardPos.x - cardPos.y].bottomNext;
        else if (cardPos.y === 0)
            return this.cards[cardPos.x].val;
        
        for (let y = 1; y <= Math.abs(cardPos.y); y++) {
            if (currentNode == undefined)
                return CardType.EMPTY;
            
            if (Math.abs(cardPos.y) === y)
                return currentNode.val;
            
            currentNode = currentNode.next;
        }

        return CardType.EMPTY;
    }

    get p1Deck() { return this.playerDecks[0]; }
    get p2Deck() { return this.playerDecks[1]; }
    get placedCards() { return this.cards; }
    get currentPlayer() { return this.currentTurn; }
};

export {
    GameController,
    CardType,
    CNode,
    BeginningNode
};