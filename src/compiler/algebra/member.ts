import { Register } from "../register";

export interface Member {
    add(a: Member): Member;
    mul(a: Member): Member;
    sub(a: Member): Member;
    div(a: Member): Member;
    ifBit(r: Register, b: number, other: Member): Member;
    eq(a: Member): Register;
}

export class EmptyMember implements Member {

    add(a: Member): Member {
        return new EmptyMember();
    }

    mul(a: Member): Member {
        return new EmptyMember();
    }

    sub(a: Member): Member {
        return new EmptyMember();
    }

    div(a: Member): Member {
        return new EmptyMember();
    }

    ifBit(r: Register, b: number): Member {
        return new EmptyMember();
    }

    eq(a: Member): Register {
        const r = new Register();
        r.setValue(1n);
        return r;
    }
}
