import { Register } from "../vm/state";
import { vm } from "../vm/vm";

export interface Member {
    add(a: Member): Member;
    mul(a: Member): Member;
    sub(a: Member): Member;
    div(a: Member): Member;
    if(r: Register, other: Member): Member;
    eq(a: Member): Register;
    zero(): Member;
    neg(): Member;
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

    neg(): Member {
        return  new EmptyMember();
    }

    div(a: Member): Member {
        return new EmptyMember();
    }

    if(r: Register): Member {
        return new EmptyMember();
    }

    eq(a: Member): Register {
        const r = vm.newRegister();
        r.setValue(1n);
        return r;
    }

    zero(): Member {
        return this;
    }
}
