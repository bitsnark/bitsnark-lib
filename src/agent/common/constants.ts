export const DEAD_ROOT = Buffer.from([0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a]);

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export const proof = {
    pi_a: [
        '4531350982720745483183896166010272188780196700199407980342269744581989148149',
        '8537072424426339037594105475681425616791387434880920465097584850313527560965'
    ],
    pi_b: [
        [
            '2411699281801306923564935501152972918367713935498519592436730569804473762071',
            '9802075445186058683936769178514143384687031267769197843391560534835079597863'
        ],
        [
            '9841644077687891842107824701324051165061919977670341286300780240127706993433',
            '542961677870429289316706958907664752199371035048761897149284127652926867503'
        ]
    ],
    pi_c: [
        '3973245501156043393965035252994987222825469293526203824011347102421386558530',
        '5182492167196517803964084985226343839022108025654500361628202698319357889198'
    ]
};

const t = [
    proof.pi_a[0],
    proof.pi_a[1],
    proof.pi_b[0][1],
    proof.pi_b[0][0],
    proof.pi_b[1][1],
    proof.pi_b[1][0],
    proof.pi_c[0],
    proof.pi_c[1]
];
export const proofBigint = t.map((s) => BigInt(s));

export const publicSignals = ['19820469076730107577691234630797803937210158605698999776717232705083708883456', '11'];

export const internalPublicKey = 0x55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312dn;

export const verificationKey = {
    protocol: 'groth16',
    curve: 'bn128',
    nPublic: 2,
    vk_alpha_1: [
        '21712882250472796272161788137658761599131127155430822464824672498476826388551',
        '552741532735314699926400759823293923105907069604986766042478074962192337366',
        '1'
    ],
    vk_beta_2: [
        [
            '11454657900582179986942752433396175393379495277505314089098948702824581371073',
            '12058235453740420034921457986465505463457514607198777288482514440281218605028'
        ],
        [
            '9245012449840884679075676193884780481706956365868051138079687915934413768997',
            '14348239919612624225209599824418433914444557994830931450885824657802418934202'
        ],
        ['1', '0']
    ],
    vk_gamma_2: [
        [
            '10857046999023057135944570762232829481370756359578518086990519993285655852781',
            '11559732032986387107991004021392285783925812861821192530917403151452391805634'
        ],
        [
            '8495653923123431417604973247489272438418190587263600148770280649306958101930',
            '4082367875863433681332203403145435568316851327593401208105741076214120093531'
        ],
        ['1', '0']
    ],
    vk_delta_2: [
        [
            '19749955201276019113767908335412065539635760453824542580852110315987111407211',
            '15438115071310379730640950544985926952604930553405319893567683759101083548862'
        ],
        [
            '8081373083339833367863828227041427035692797663482727195083250203573955986378',
            '5039646762941336679168675399139810890393860924275729758598296551114657136302'
        ],
        ['1', '0']
    ],
    vk_alphabeta_12: [
        [
            [
                '83246192919196632629911293082507223331535741214291277753177009822773807039',
                '9147681130761915124992103762624270923270578778615653504674237253332848351635'
            ],
            [
                '14763855245243506392883735077939310098926871520831926647631912284352888124556',
                '11103074638230520106821751403226287887956436652540939881866408662512666357442'
            ],
            [
                '12984538483238484324045715603191758939139256752759089475975708670567228515894',
                '8600035415405927876147079830500883365461650712915995990656852431919567914551'
            ]
        ],
        [
            [
                '20200568705241693194370952547326466253957663538037514759379848392721636051059',
                '7267055554614047990702204460623638378118971681095287678248229096270056718464'
            ],
            [
                '5423010749865132785108316047507820728226882076602498556580145061887662054183',
                '10506934983360800929453798956239960237509124064034702657335978238164078944379'
            ],
            [
                '16912024337441250577926137093507037562957878204566913339063708506211532668467',
                '10703864755384914750022054659634869688591627626806189011752344395366855259226'
            ]
        ]
    ],
    IC: [
        [
            '15228319439367907688412448440498031133959967042739898244747533922285298263588',
            '7325414058263354695276256220131713148508401078319479089590352962374400955943',
            '1'
        ],
        [
            '15787697953497698366259422004335840598898242056369433499534726268976760863408',
            '13999881966261347350313268261994882673895614399911197048975752238692140366328',
            '1'
        ],
        [
            '11658042682902220805035875782281846254107538847337155467126794851474468453075',
            '17111742092987389674133413486604666043472810767103656700764313114323999544388',
            '1'
        ]
    ]
};
