export const GATOR = {
  targetBandToMod: [0,1,2,3,4,5,6],
  posture: { normal:0, padj:-2, prone:1, imm:-4 },
  computeTN({G,A,T, T_adv, O, R}) {
    let t = GATOR.targetBandToMod[Math.max(0, Math.min(6, T||0))];
    if (T_adv?.jump) t += 1;
    if (T_adv?.padj) t = GATOR.posture.padj;
    else if (T_adv?.prone) t = GATOR.posture.prone;
    else if (T_adv?.imm)   t = GATOR.posture.imm;

    const sum = (G|0) + (A|0) + t + (O|0) + (R|0);
    return sum <= 2 ? { text:'Auto', cls:'tn-auto', val:sum }
         : sum <= 9 ? { text: `${sum}+`, cls:'tn-yellow', val:sum }
                    : { text: `${sum}+`, cls:'tn-red',    val:sum };
  }
}; 
