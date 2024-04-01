import { Member } from "./member";
import { Register } from "../vm/register";
import { Polynomial } from "./polynomials";

export class ExtensionMember implements Member {

    polymod: Polynomial;
    value: Polynomial;

    constructor(polymod: Polynomial, value?: Polynomial) {
        this.polymod = polymod;
        this.value = value ? value : new Polynomial(polymod.prime, polymod.count);
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

    ifBit(r: Register, bit: number, other: Member): Member {
        throw new Error('Not implemented');
    }

    zero(): Member {
        return this.polymod;
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
