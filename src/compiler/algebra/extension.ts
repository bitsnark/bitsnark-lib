import { Member } from "./member";
import { Register } from "../vm/state";
import { Polynomial } from "./polynomial";

export class ExtensionMember implements Member {

    polymod: Polynomial;
    value: Polynomial;

    constructor(polymod: Polynomial, value?: Polynomial) {
        this.polymod = polymod;
        this.value = value ? value : new Polynomial(polymod.primeField, polymod.degree);
    }

    validate(a: any) {
        if (!(a instanceof ExtensionMember)) throw new Error('Invalid type');
        return a;
    }

    eq(_a: Member): Register {
        const a = this.validate(_a);
        return this.value.eq(a.value);
    }

    new(poly?: Polynomial): ExtensionMember {
        return new ExtensionMember(this.polymod, poly);
    }

    add(_a: Member): Member {
        const a = this.validate(_a);
        return this.new((this.value.add(a.value) as Polynomial)
            .mod(this.polymod) as Polynomial);
    }

    mul(_a: Member): Member {
        const a = this.validate(_a);
        return this.new(
            (this.value.mul(a.value) as Polynomial).mod(this.polymod));
    }

    sub(_a: Member): Member {
        const a = this.validate(_a);
        return this.new((this.value.sub(a.value) as Polynomial)
            .mod(this.polymod) as Polynomial);
    }

    div(_a: Member): Member {
        const a = this.validate(_a);
        return this.new((this.value.div(a.value) as Polynomial)
            .mod(this.polymod) as Polynomial);
    }

    if(r: Register, other: Member): Member {
        const result = this.new();
        result.value = this.value.if(r, (other as ExtensionMember).value) as Polynomial;
        return result;
    }

    zero(): Member {
        return this.new();
    }

    one(): Member {
        return this.new(this.polymod.one());
    }

    neg(): Member {
        return this.zero().sub(this);
    }

    pow(a: Member): Member {
        return this.new(this.value.pow(a) as Polynomial);
    }

    toString(): String {
        return this.value.toString();
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

    hardcoded(a: bigint[]): ExtensionMember {
        return new ExtensionMember(this.polymod, new Polynomial(this.polymod.primeField,
            this.polymod.degree,
            a.map(n => this.polymod.primeField.newHardcoded(n))
        ));
    }
}
