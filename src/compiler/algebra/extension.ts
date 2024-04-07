import { Member } from "./member";
import { Register } from "../vm/state";
import { Polynomial } from "./polynomials";

export class ExtensionMember implements Member {

    polymod: Polynomial;
    value: Polynomial;

    constructor(polymod: Polynomial, value?: Polynomial) {
        this.polymod = polymod;
        this.value = value ? value : new Polynomial(polymod.prime, polymod.degree);
    }

    eq(a: Member): Register {
        return this.value.eq(a);
    }

    add(a: Member): Member {
        return new ExtensionMember(this.polymod,
            (this.value.add(a) as Polynomial).mod(this.polymod) as Polynomial);
    }

    mul(a: Member): Member {
        return new ExtensionMember(this.polymod,
            (this.value.mul(a) as Polynomial).mod(this.polymod) as Polynomial);
    }

    sub(a: Member): Member {
        return new ExtensionMember(this.polymod,
            (this.value.sub(a) as Polynomial).mod(this.polymod) as Polynomial);
    }

    div(a: Member): Member {
        return new ExtensionMember(this.polymod,
            (this.value.div(a) as Polynomial).mod(this.polymod) as Polynomial);
    }

    if(r: Register, other: Member): Member {
        throw new Error('Not implemented');
    }

    zero(): Member {
        return new ExtensionMember(this.polymod,
            new Polynomial(this.polymod.prime, this.polymod.degree));
    }

    neg(): Member {
        return this.zero().sub(this);
    }
}

export class ExtensionField {

    polymod: Polynomial;

    constructor(polymod: Polynomial) {
        this.polymod = polymod;
    }

    newMember(p?: Polynomial): ExtensionMember {
        return new ExtensionMember(this.polymod, p);
    }
}
