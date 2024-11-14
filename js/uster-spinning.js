const moment = require("moment");

const router = express.Router();
const axios = require("axios");
const qs = require("querystring");

const nodeurl = "http://192.168.11.8:8088";
const nodeurl1 = "http://192.168.11.12:8070";
const usterwebserviceurl = "http://192.168.24.110:8075/Production.asmx/GetDataByAnyDB";

// fetcher
function requestFetch3(url, parameters, timeout) {
    if (url === null) {
      url = nodeurl1;
    }
    return new Promise((resolve, reject) => {
      request.post(
        {
          url: url,
          json: parameters,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=60",
          },
          timeout: timeout === null ? 5000 : parseInt(timeout),
        },
        (error, res, body) => {
          if (error) {
            console.error(error);
            if (url === nodeurl) {
              requestFetch(nodeurl1, parameters, timeout);
            }
            reject(error);
            return false;
          }
          resolve(body);
          return true;
        },
      );
    });
  }

async function requestFetchusterwebservice(url, parameters, timeout) {
  if (url === null) {
    url = usterwebserviceurl;
  }
  try {
    const response = await axios.post(url, qs.stringify(parameters), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      timeout: timeout === null ? 5000 : parseInt(timeout),
    });
    return response.data;
  } catch (error) {
    console.error(error);
    if (url === nodeurl) {
      return requestFetchdotnet(nodeurl1, parameters, timeout);
    }

    throw error;
  }
}

// summary data for report
router.post("/ustersummary", function (req, res, next) {
  let json = req.body;
  let db = "QuantumExpert2_0";
  let fromdate = json.fromdate;
  let todate;
  let options = { day: "2-digit", month: "short", year: "numeric" };

  if (fromdate === json.todate) {
    let toDateObj = new Date(json.todate);
    toDateObj.setDate(toDateObj.getDate() + 1);
    let day = toDateObj.getDate();
    let month = toDateObj.toLocaleString("en-GB", { month: "short" });
    let year = toDateObj.getFullYear();
    todate = `${day}-${month}-${year}`;
  } else {
    todate = json.todate;
  }

  // let promise1 = fetcher.requestFetch3(null, {
  //   query: `SELECT MAX(S.ID) AS ID, REPLACE(REPLACE(S.MachineName, 'AC-0', ''), 'AC-', '') AS MachineNo, FORMAT(S.ShiftStartTime,'dd MMM yyyy') AS ProdDate, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ) AS YarnCounts,S.ShiftNumber AS ShiftNo, SUM(round(S.YarnWeight * 0.99, 0)) AS ShiftProdQty, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909 AS YarnCount_Calcr, S.YarnCountTotal INTO #temp1 FROM [Shift].V_Group_AllProductionData AS S WHERE S.[ShiftStartTime] >= CONVERT(DATETIMEOFFSET, '${fromdate}', 121) AND S.[ShiftStartTime] <= CONVERT(DATETIMEOFFSET, '${todate}', 121) AND S.YarnWeight > 5 AND S.ArticleName LIKE '%s%' GROUP BY S.MachineName, S.ShiftStartTime, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ), S.ShiftNumber, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909, S.YarnCountTotal     ORDER BY S.MachineName select * from #temp1 where YarnCounts != 'INIT   12'`,
  //   DB: db,
  //   timeout: 50000,
  // });
  let promise1 = requestFetchusterwebservice(null, {
    SPName: "USP_SpinningShiftProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT_SUMMARY_SHIFT_PRODUCTION_REPORT", "Fromdate": "${fromdate}", "todate": "${todate}" }`,
  });

  let ToDate = json.todate;
  let promise2 = requestFetch3(null, {
    SPName: "USP_tblMSpinningProduction",
    JSONData: { ReqType: "USTER_REPORT_SELECT", fromdate, ToDate },
    DB: "ALCSpinning_Live",
  });
  return Promise.all([promise1, promise2]).then((ress) => {
    fromdate = global.moment(fromdate);
    todate = global.moment(todate);

    let spinningprod = ress[1];
    let uspterprod = ress[0];

    let spinningMap = new Map();
    let proddata = [];
    if (ress[1].length > 0) {
      spinningprod.forEach((item) => {
        const key = `${item.ShiftNo}-${item.MachineNo}`;
        spinningMap.set(key, true);
        proddata.push(item);
      });
    }

    if (ress[0].length > 0) {
      let unmatcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.ShiftNo}-${usterItem.MachineNo}`;
        return !spinningMap.has(key);
      });

      if (unmatcheddata.length > 0) {
        unmatcheddata.forEach((item) => {
          proddata.push(item);
        });
      }
    }
    let Production = proddata;

    let aggregatedData = Production.reduce((accumulator, item) => {
      const { YarnCounts, ShiftProdQty } = item;
      let found = false;
      for (let i = 0; i < accumulator.length; i++) {
        if (accumulator[i].Counts === YarnCounts) {
          accumulator[i].ShiftProdQty += ShiftProdQty;
          found = true;
          break;
        }
      }
      if (!found) {
        accumulator.push({ Counts: YarnCounts, ShiftProdQty: ShiftProdQty });
      }

      return accumulator;
    }, []);
    let finaldata = [];
    aggregatedData.forEach((item) => {
      let replaced_count = item.Counts.replace("16s SL", "16SL").replace("20s SL", "20SL").replace("21s SL", "21SL").replace("32s SL", "32SL").replace("40s SL", "40SL").replace("KC", "Carded Compact").replace("KL", "Carded Lycra").replace("CL", "Combed Lycra").replace("CC", "Combed Compact").replace("K", "Carded").replace("CH", "Cheese").replace("CO", "Cone").replace("C ", "Combed ");
      finaldata.push({ Counts: replaced_count, ShiftProdQty: item.ShiftProdQty });
    });

    return res.json(finaldata);
  });
});

// single report data
router.post("/uster", function (req, res, next) {
  let json = req.body;
  let db = "QuantumExpert2_0";
  let fromdate = json.fromdate;
  let todate;
  let options = { day: "2-digit", month: "short", year: "numeric" };

  if (fromdate === json.todate) {
    let toDateObj = new Date(json.todate);
    toDateObj.setDate(toDateObj.getDate() + 1);
    let day = toDateObj.getDate();
    let month = toDateObj.toLocaleString("en-GB", { month: "short" });
    let year = toDateObj.getFullYear();
    todate = `${day}-${month}-${year}`;
  } else {
    todate = json.todate;
  }

  let promises1 = requestFetch3(null, {
    SPName: "USP_YarnTarget",
    // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
    JSONData: { ReqType: "SELECT_FOR_USTER_REPORT" },
    DB: "ALCSpinning_Live",
  });

  // let promise2 = fetcher.requestFetch3(null, {
  //   query: `SELECT MAX(S.ID) AS ID, REPLACE(REPLACE(S.MachineName, 'AC-0', ''), 'AC-', '') AS MachineNo, FORMAT(S.ShiftStartTime,'dd MMM yyyy') AS ProdDate, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ) AS YarnCounts,S.ShiftNumber AS ShiftNo, SUM(round(S.YarnWeight * 0.99, 0)) AS ShiftProdQty, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909 AS YarnCount_Calcr, S.YarnCountTotal INTO #temp1 FROM [Shift].V_Group_AllProductionData AS S WHERE S.[ShiftStartTime] >= CONVERT(DATETIMEOFFSET, '${fromdate}', 121) AND S.[ShiftStartTime] <= CONVERT(DATETIMEOFFSET, '${todate}', 121) AND S.YarnWeight > 5 AND S.ArticleName LIKE '%s%' GROUP BY S.MachineName, S.ShiftStartTime, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ), S.ShiftNumber, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909, S.YarnCountTotal     ORDER BY S.MachineName select * from #temp1 where YarnCounts != 'INIT   12'`,
  //   DB: db,
  //   timeout: 50000,
  // });
  let promise2 = requestFetchusterwebservice(null, {
    SPName: "USP_SpinningShiftProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT_SHIFT_PRODUCTION_REPORT",  "fromdate": "${fromdate}", "todate": "${todate}" }`,
  });

  let ToDate = json.todate;
  let promise3 = requestFetch3(null, {
    SPName: "USP_tblMSpinningProduction",
    JSONData: { ReqType: "USTER_REPORT_SELECT", fromdate, ToDate },
    DB: "ALCSpinning_Live",
  });

  return Promise.all([promises1, promise2, promise3]).then((ress) => {
    fromdate = global.moment(fromdate);
    todate = global.moment(todate);

    let mcTarget = ress[0];
    let spinningprod = ress[2];
    let uspterprod = ress[1];
    // let mcProduction = ress[2].length > 0 ? ress[2] : ress[1];
    let spinningMap = new Map();
    let proddata = [];
    if (ress[2].length > 0) {
      spinningprod.forEach((item) => {
        const key = `${item.ShiftNo}-${item.MachineNo}`;
        spinningMap.set(key, true);
        proddata.push(item);
      });
    }

    if (ress[1].length > 0) {
      let unmatcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.ShiftNo}-${usterItem.MachineNo}`;
        return !spinningMap.has(key);
      });

      // console.log(unmatcheddata);
      if (unmatcheddata.length > 0) {
        unmatcheddata.forEach((item) => {
          proddata.push(item);
        });
      }
    }
    const sortedproddata = proddata.sort((a, b) => a.MachineNo - b.MachineNo);
    let mcProduction = sortedproddata;

    let mcTargetDetils = [];
    let finallst = [];
    mcProduction &&
      mcProduction.forEach((mprod) => {
        let YarnCounts;
        let finalYarnCounts;
        if (mprod.YarnCounts) {
          if (mprod.YarnCounts.includes("CH")) {
            finalYarnCounts = mprod.YarnCounts.replace("CH", "Cheese");
          } else if (mprod.YarnCounts.includes("CO")) {
            finalYarnCounts = mprod.YarnCounts.replace("CO", "Cone");
          }
        }

        if (finalYarnCounts.includes("KC")) {
          YarnCounts = finalYarnCounts.replace("KC", "Carded Compact");
        } else if (finalYarnCounts.includes("KL")) {
          YarnCounts = finalYarnCounts.replace("KL", "Carded Lycra");
        } else if (finalYarnCounts.includes("CL")) {
          YarnCounts = finalYarnCounts.replace("CL", "Combed Lycra");
        } else if (finalYarnCounts.includes("CC")) {
          YarnCounts = finalYarnCounts.replace("CC", "Combed Compact");
        } else if (finalYarnCounts.includes("K")) {
          YarnCounts = finalYarnCounts.replace("K", "Carded");
        } else if (finalYarnCounts.includes("C")) {
          YarnCounts = finalYarnCounts.replace("C", "Combed");
        }

        let dd = { ID: parseInt(mprod["ID"]), date: mprod["ProdDate"], shift: mprod["ShiftNo"], machineno: mprod["MachineNo"], prodqty: roundoff(mprod["ShiftProdQty"], 2), YarnCounts: YarnCounts, YarnType: mprod["YarnType"], Cheese: mprod["Cheese"] };

        var formatedYarnCounts = mprod.YarnCounts.replace(" CO", "");
        formatedYarnCounts = formatedYarnCounts.replace(" CH", "");
        formatedYarnCounts = formatedYarnCounts.replace("16s  CL", "16S CL");
        formatedYarnCounts = formatedYarnCounts.toUpperCase();
        for (let i = 0; i < mcTarget.length; i++) {
          if (formatedYarnCounts.toUpperCase() === mcTarget[i].YarnCountsType.toUpperCase()) {
            dd["target"] = mcTarget[i].ShiftTarget;

            if (mprod["ShiftProdQty"] && mcTarget[i].ShiftTarget) {
              let effper = (mprod["ShiftProdQty"] / mcTarget[i].ShiftTarget) * 100;
              dd["eff"] = roundoff(effper, 2);
            }
          }
        }
        finallst.push(dd);
      });

    if (finallst.length > 28 && finallst.length < 30) {
      for (let i = 1; i < 11; i++) {
        let lessermachine;
        let machinecount = 0;
        finallst.forEach((item) => {
          if (item.machineno == `${i}`) {
            machinecount += 1;
          }
        });
        if (machinecount < 3) {
          lessermachine = i;
        }
        if (lessermachine) {
          let remainingshiftno = 0;
          let gettarget;
          finallst.forEach((item) => {
            if (item.machineno == `${lessermachine}`) {
              remainingshiftno += item.shift;
              gettarget = item.target;

              let shiftno;
              if (remainingshiftno == 3) {
                shiftno = 3;
              } else if (remainingshiftno == 4) {
                shiftno = 2;
              } else if (remainingshiftno == 5) {
                shiftno = 1;
              }
              let dd;
              if (shiftno) {
                dd = { ID: parseInt(item.ID), date: item.date, shift: shiftno, machineno: item.machineno, prodqty: roundoff(0, 2), YarnCounts: "", YarnType: "", Cheese: "", target: gettarget, eff: (0 / gettarget) * 100 };
              }
              if (dd) {
                finallst.push(dd);
                return;
              }
            }
          });
        }
      }
    }

    const transformedData = finallst.reduce((result, item) => {
      const existingItem = result.find((el) => el.date === item.date && el.machineno === item.machineno);
      const key = { machineno: `${item.machineno}`, [`Shift${item.shift}_YarnCountsTypeCheese`]: true };

      if (!existingItem) {
        const newItem = {
          date: item.date,
          machineno: item.machineno,
          [`Shift${item.shift}_YarnCountsTypeCheese`]: item.YarnCounts ? item.YarnCounts : "",
          shift1: "Shift: 1",
          shift2: "Shift: 2",
          shift3: "Shift: 3",
          total: "Total",
          [`Shift${item.shift}_prodqty`]: item.prodqty > 0 ? item.prodqty : 0,
          [`Shift${item.shift}_eff`]: item.eff > 0 ? item.eff : 0,
          [`Shift${item.shift}_target`]: item.target > 0 ? item.target : 0,
          [`Shift${item.shift}ID`]: item.ID,
          prodqty_total: item.prodqty > 0 ? item.prodqty : 0,
          target_total: item.target > 0 ? item.target : 0,
          eff_total: item.eff > 0 ? item.eff : 0,
        };

        result.push(newItem);
      } else {
        if (existingItem[Object.keys(key)[1]]) {
          // existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] += item.YarnCounts ? ` / ${item.YarnCounts}` : "";
          existingItem[`Shift${item.shift}_prodqty`] += item.prodqty > 0 ? item.prodqty : 0;
          // existingItem.target_total = item.target;
        } else {
          // existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] = item.YarnCounts ? item.YarnCounts : "";
          existingItem[`Shift${item.shift}_prodqty`] = item.prodqty > 0 ? item.prodqty : 0;
          // existingItem.target_total += item.target > 0 ? item.target : 0;
        }
        if (existingItem[`Shift${item.shift}_target`]) {
          const shiftStartTime = existingItem[`Shift${item.shift}ID`];
          const comparisonDate = item.ID;
          if (shiftStartTime > comparisonDate) {
            existingItem[`Shift${item.shift}_target`] = existingItem[`Shift${item.shift}_target`];
            existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] = existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] + ` / ${item.YarnCounts}`;
            existingItem[`Shift${item.shift}_eff`] = roundoff((existingItem[`Shift${item.shift}_prodqty`] / existingItem[`Shift${item.shift}_target`]) * 100, 2);
          } else {
            existingItem[`Shift${item.shift}_target`] = item.target > 0 ? item.target : 0;
            existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] = `${item.YarnCounts}` + "/" + existingItem[`Shift${item.shift}_YarnCountsTypeCheese`];
            existingItem[`Shift${item.shift}_eff`] = roundoff((existingItem[`Shift${item.shift}_prodqty`] / item.target) * 100, 2);
          }
        } else {
          existingItem[`Shift${item.shift}_target`] = item.target > 0 ? item.target : 0;
          existingItem[`Shift${item.shift}_YarnCountsTypeCheese`] = item.YarnCounts ? item.YarnCounts : "";
          existingItem[`Shift${item.shift}_eff`] = item.eff > 0 ? item.eff : 0;
        }
        existingItem[`Shift${item.shift}ID`] = item.ID;

        existingItem.prodqty_total += item.prodqty > 0 ? item.prodqty : 0;
        // existingItem.eff_total += item.eff > 0 ? item.eff : 0;
        // if (existingItem.Shift1_target && existingItem.Shift2_target && existingItem.Shift3_target) {
        // existingItem.eff_total = existingItem.eff_total / 3;
        existingItem.target_total = (existingItem.Shift1_target || 0) + (existingItem.Shift2_target || 0) + (existingItem.Shift3_target || 0);
        existingItem.eff_total = (existingItem.prodqty_total / existingItem.target_total) * 100;
        // }
      }

      return result;
    }, []);
    // console.log(transformedData);
    return res.json(transformedData);
  });
});

// summary ios data
router.post("/ustersummaryios", function (req, res, next) {
  let json = req.body;
  let db = "QuantumExpert2_0";
  let Fromdate = json.fromdate;
  let Todate = json.todate;

  let options = { day: "2-digit", month: "short", year: "numeric" };

  let promises1 = requestFetch3(null, {
    SPName: "USP_YarnTarget",
    // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
    JSONData: { ReqType: "SELECT_FOR_USTER_REPORT" },
    DB: "ALCSpinning_Live",
  });

  // let promise2 = fetcher.requestFetch3(null, {
  //   SPName: "USP_GetShiftProduction",
  //   // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
  //   JSONData: { ReqType: "SELECT", SubType: "MachineWise", Fromdate, Todate },
  //   DB: db,
  // });

  let promise2 = requestFetchusterwebservice(null, {
    SPName: "USP_GetShiftProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT", "SubType" : "MachineWise", "Fromdate": "${Fromdate}", "todate": "${Todate}" }`,
  });

  let promise3 = requestFetch3(null, {
    SPName: "USP_GTQtyToProductionApp",
    // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
    JSONData: { Fromdate, Todate },
    DB: "ALCSpinning_Live",
  });

  let fromdate = json.fromdate;
  let todate = json.todate;
  // let promise4 = fetcher.requestFetch3(null, {
  //   SPName: "USP_tblMSpinningProduction",
  //   JSONData: { ReqType: "USTER_IOS_SUMMARY_SELECT", fromdate, todate },
  //   DB: "ALCSpinning_Live",
  // });
  let promise4 = requestFetch3(null, {
    SPName: "USP_tblMSpinningProduction",
    JSONData: { ReqType: "USTER_IOS_MECHINEWISE_SELECT", fromdate, todate },
    DB: "ALCSpinning_Live",
  });

  return Promise.all([promises1, promise2, promise3, promise4]).then((ress) => {
    Fromdate = global.moment(Fromdate);
    Todate = global.moment(Todate);

    const currentdata = moment();
    const todate1 = moment(Todate);
    let datelength;
    if (currentdata <= todate1) {
      datelength = currentdata.diff(Fromdate, "day");
    } else {
      datelength = Todate.diff(Fromdate, "day");
    }

    let mcTarget = ress[0];
    let spinningprod = ress[3];
    let uspterdata = ress[1];
    let uspterprod = uspterdata.filter((uspterdata, index, self) => index === self.findIndex((t) => t.InwardDate === uspterdata.InwardDate && t.MachineNo === uspterdata.MachineNo));
    let spinningMap = new Map();
    let Spinningproddata = [];
    let proddata = [];
    if (ress[2].length > 0) {
      spinningprod.forEach((item) => {
        const key = `${item.InwardDate}-${item.MachineNo}`;
        spinningMap.set(key, true);
        Spinningproddata.push(item);
      });
    }
    if (ress[1].length > 0) {
      let matcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.InwardDate}-${usterItem.MachineNo}`;
        return spinningMap.has(key);
      });

      matcheddata.forEach((item, v) => {
        let spinningdate = new Date(Spinningproddata[v].InwardDate);
        let usterdate = new Date(item.InwardDate);
        if (spinningdate.getDate() === usterdate.getDate() && Spinningproddata[v].MachineNo === item.MachineNo) {
          Spinningproddata[v].Qty = 0;
          if (!Spinningproddata[v].S1) {
            Spinningproddata[v].S1 = item.S1;
            Spinningproddata[v].Shiftno1 = 1;
          }
          if (!Spinningproddata[v].S2) {
            Spinningproddata[v].S2 = item.S2;
            Spinningproddata[v].Shiftno2 = 2;
          }
          if (!Spinningproddata[v].S3) {
            Spinningproddata[v].S3 = item.S3;
            Spinningproddata[v].Shiftno3 = 3;
          }
          Spinningproddata[v].Qty = Spinningproddata[v].S1 + Spinningproddata[v].S2 + Spinningproddata[v].S3;
          proddata.push(Spinningproddata[v]);
        }
      });
      Spinningproddata.forEach((v) => {
        let date1 = new Date(v.InwardDate);
        if (
          !proddata.some((value) => {
            let date2 = new Date(value.InwardDate);
            return date2.getDate() === date1.getDate() && value.MachineNo === v.MachineNo;
          })
        ) {
          proddata.push(v);
        }
      });
    } else {
      Spinningproddata.forEach((item) => {
        proddata.push(item);
      });
    }
    if (ress[1].length > 0) {
      let unmatcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.InwardDate}-${usterItem.MachineNo}`;
        return !spinningMap.has(key);
      });

      // console.log(unmatcheddata);
      if (unmatcheddata.length > 0) {
        unmatcheddata.forEach((item) => {
          proddata.push(item);
        });
      }
    }
    const sortedproddata = proddata.sort((a, b) => {
      let dateA = new Date(a.InwardDate);
      let dateB = new Date(b.InwardDate);
      return dateA - dateB;
    });
    let mcProduction = sortedproddata;
    // let Production = proddata;
    let GTdata = ress[2];

    let targetarray = [];
    mcProduction.forEach((mprod) => {
      let target = 0;
      let targetvalue = 0;
      var formatedYarnCounts = mprod.YarnCounts1.replace(" CO", "");
      formatedYarnCounts = formatedYarnCounts.replace(" CH", "");
      formatedYarnCounts = formatedYarnCounts.toUpperCase();

      for (let i = 0; i < mcTarget.length; i++) {
        if (formatedYarnCounts === mcTarget[i].YarnCountsType) {
          if (mprod.Shiftno1) {
            target += 1;
          }
          if (mprod.Shiftno2) {
            target += 1;
          }
          if (mprod.Shiftno3) {
            target += 1;
          }
          targetvalue = mcTarget[i].ShiftTarget * target;
        }
      }
      targetarray.push(targetvalue);
    });

    let result = [];
    for (let j = 0; j < mcProduction.length; j++) {
      const element = {
        InwardDate: mcProduction[j].InwardDate,
        MachineNo: mcProduction[j].MachineNo,
        ShiftQty: mcProduction[j].Qty,
        ShiftEff: targetarray[j],
        // GTQty: GTdata[j].GTQty,
      };
      result.push(element);
    }
    const data = result.reduce((acc, curr, i) => {
      const { InwardDate, MachineNo, ShiftQty, ShiftEff } = curr;
      const existingItem = acc.find((item) => item.InwardDate === InwardDate);
      const existingMachineNo = acc.find((item) => item.InwardDate === InwardDate && item.MachineNo === MachineNo);

      if (existingItem) {
        existingItem.ShiftQty += ShiftQty;
        existingItem.ShiftEff += ShiftEff;
        existingItem.MachineNo = MachineNo;
        if (existingMachineNo) {
          existingItem.ShiftEff -= result[i - 1].ShiftEff;
        }
      } else {
        acc.push({ InwardDate: InwardDate, MachineNo: MachineNo, ShiftQty: ShiftQty, ShiftEff: ShiftEff });
      }
      return acc;
    }, []);
    let final_data = [];
    // data.forEach((d, i) => {
    //   const fdata = {
    //     InwardDate: d.InwardDate,
    //     MachineNo: d.MachineNo,
    //     ShiftEff: d.ShiftEff,
    //     ShiftQty: d.ShiftQty,
    //   };

    //   if (d.InwardDate === GTdata[i].CreatedOn) {
    //     fdata.GTQty = Math.round(GTdata[i].GTQty);
    //   }

    //   final_data.push(fdata);
    // });

    if (data.length > 0) {
      for (let z = 0; z <= datelength; z++) {
        let newDate = Fromdate.add(z > 0 ? 1 : 0, "days");
        let fdate = newDate.format("DD MMM yyyy");
        let fdata = [];
        const checked_data = data.find((item, z) => item.InwardDate === fdate);
        if (checked_data) {
          fdata = {
            InwardDate: checked_data.InwardDate,
            MachineNo: checked_data.MachineNo,
            ShiftEff: checked_data.ShiftEff,
            ShiftQty: checked_data.ShiftQty,
          };
          if (checked_data.InwardDate === GTdata[z].CreatedOn) {
            fdata.GTQty = Math.round(GTdata[z].GTQty);
          }
        } else {
          fdata = {
            InwardDate: fdate,
            MachineNo: 0,
            ShiftEff: 0,
            ShiftQty: 0,
          };
          if (GTdata[z].CreatedOn) {
            fdata.GTQty = Math.round(GTdata[z].GTQty);
          }
        }
        final_data.push(fdata);
      }
    }
    return res.json(final_data);
  });
});

// machinewise  ios data
router.post("/usteriosmachinewise", function (req, res, next) {
  let json = req.body;
  let db = "QuantumExpert2_0";
  let Fromdate = json.fromdate;
  let Todate = json.todate;
  let options = { day: "2-digit", month: "short", year: "numeric" };

  let promises1 = requestFetch3(null, {
    SPName: "USP_YarnTarget",
    JSONData: { ReqType: "SELECT_FOR_USTER_REPORT" },
    DB: "ALCSpinning_Live",
  });

  // let promise2 = fetcher.requestFetch3(null, {
  //   SPName: "USP_GetShiftProduction",
  //   // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
  //   JSONData: { ReqType: "SELECT", SubType: "MachineWise", Fromdate, Todate },
  //   DB: db,
  // });
  let promise2 = requestFetchusterwebservice(null, {
    SPName: "USP_GetShiftProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT", "SubType" : "MachineWise", "Fromdate": "${Fromdate}", "todate": "${Todate}" }`,
  });

  let fromdate = json.fromdate;
  let todate = json.todate;
  let promise3 = requestFetch3(null, {
    SPName: "USP_tblMSpinningProduction",
    JSONData: { ReqType: "USTER_IOS_MECHINEWISE_SELECT", fromdate, todate },
    DB: "ALCSpinning_Live",
  });

  return Promise.all([promises1, promise2, promise3]).then((ress) => {
    Fromdate = global.moment(Fromdate);
    Todate = global.moment(Todate);

    let mcTarget = ress[0];
    // let mcProduction = ress[2].length > 0 ? ress[2] : ress[1];
    let spinningprod = ress[2];
    let uspterprod = ress[1];
    let spinningMap = new Map();
    let Spinningproddata = [];
    let proddata = [];
    if (ress[2].length > 0) {
      spinningprod.forEach((item) => {
        const key = `${item.MachineNo}`;
        spinningMap.set(key, true);
        Spinningproddata.push(item);
      });
    }
    if (ress[1].length > 0) {
      let matcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.MachineNo}`;
        return spinningMap.has(key);
      });

      matcheddata.forEach((item, v) => {
        Spinningproddata[v].Qty = 0;
        if (!Spinningproddata[v].S1) {
          Spinningproddata[v].S1 = item.S1;
          Spinningproddata[v].Shiftno1 = 1;
        }
        if (!Spinningproddata[v].S2) {
          Spinningproddata[v].S2 = item.S2;
          Spinningproddata[v].Shiftno2 = 2;
        }
        if (!Spinningproddata[v].S3) {
          Spinningproddata[v].S3 = item.S3;
          Spinningproddata[v].Shiftno3 = 3;
        }
        Spinningproddata[v].Qty = Spinningproddata[v].S1 + Spinningproddata[v].S2 + Spinningproddata[v].S3;
        proddata.push(Spinningproddata[v]);
      });
    } else {
      Spinningproddata.forEach((item) => {
        proddata.push(item);
      });
    }
    if (ress[1].length > 0) {
      let unmatcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.MachineNo}`;
        return !spinningMap.has(key);
      });

      // console.log(unmatcheddata);
      if (unmatcheddata.length > 0) {
        unmatcheddata.forEach((item) => {
          proddata.push(item);
        });
      }
    }
    const sortedproddata = proddata.sort((a, b) => a.MachineNo - b.MachineNo);
    let mcProduction = sortedproddata;

    let targetarray = [];
    mcProduction.forEach((mprod) => {
      let target = 0;
      let targetvalue = 0;
      var formatedYarnCounts = mprod.YarnCounts1.replace(" CO", "");
      formatedYarnCounts = formatedYarnCounts.replace(" CH", "");
      formatedYarnCounts = formatedYarnCounts.toUpperCase();

      for (let i = 0; i < mcTarget.length; i++) {
        if (formatedYarnCounts === mcTarget[i].YarnCountsType) {
          if (mprod.Shiftno1) {
            target += 1;
          }
          if (mprod.Shiftno2) {
            target += 1;
          }
          if (mprod.Shiftno3) {
            target += 1;
          }
          targetvalue = mcTarget[i].ShiftTarget * target;
        }
      }
      targetarray.push(targetvalue);
    });

    let result = [];
    for (let j = 0; j < mcProduction.length; j++) {
      let Qty = mcProduction[j].Qty;
      let target = targetarray[j];
      let eff = (Qty / target) * 100;
      let length = j + 1;
      if (length !== mcProduction.length) {
        if (mcProduction[j].MachineNo !== mcProduction[j + 1].MachineNo) {
          const element = {
            Title: mcProduction[j].Title,
            InwardDate: mcProduction[j].InwardDate,
            Qty: mcProduction[j].S1 + mcProduction[j].S2 + mcProduction[j].S3,
            Shifttarget: target,
            ShiftEff: eff,
            S1: mcProduction[j].S1,
            S2: mcProduction[j].S2,
            S3: mcProduction[j].S3,
            SubTitle: mcProduction[j].SubTitle,
          };
          result.push(element);
        }
      } else {
        const element = {
          Title: mcProduction[j].Title,
          InwardDate: mcProduction[j].InwardDate,
          Qty: mcProduction[j].Qty,
          Shifttarget: target,
          ShiftEff: eff,
          S1: mcProduction[j].S1,
          S2: mcProduction[j].S2,
          S3: mcProduction[j].S3,
          SubTitle: mcProduction[j].SubTitle,
        };
        result.push(element);
      }
    }
    return res.json(result);
  });
});

// Reallisation
router.post("/UsterReallisation", function (req, res, next) {
  console.log("Request received on /UsterReallisation");

  let json = req.body;
  let db = "QuantumExpert2_0";
  let fromdate = json.fromdate;
  let todate;
  let options = { day: "2-digit", month: "short", year: "numeric" };

  if (fromdate === json.todate) {
    let toDateObj = new Date(json.todate);
    toDateObj.setDate(toDateObj.getDate() + 1);
    let day = toDateObj.getDate();
    let month = toDateObj.toLocaleString("en-GB", { month: "short" });
    let year = toDateObj.getFullYear();
    todate = `${day}-${month}-${year}`;
  } else {
    todate = json.todate;
  }

  // let promise1 = fetcher.requestFetch3(null, {
  //   query: `SELECT MAX(S.ID) AS ID, REPLACE(REPLACE(S.MachineName, 'AC-0', ''), 'AC-', '') AS MachineNo, FORMAT(S.ShiftStartTime,'dd MMM yyyy') AS ProdDate, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ) AS YarnCounts,S.ShiftNumber AS ShiftNo, SUM(round(S.YarnWeight * 0.99, 0)) AS ShiftProdQty, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909 AS YarnCount_Calcr, S.YarnCountTotal INTO #temp1 FROM [Shift].V_Group_AllProductionData AS S WITH(NOLOCK) WHERE S.[ShiftStartTime] >= CONVERT(DATETIMEOFFSET, '${fromdate}', 121) AND S.[ShiftStartTime] <= CONVERT(DATETIMEOFFSET, DATEADD(DAY, 1, CAST('${todate}' AS DATETIME)), 121) AND S.YarnWeight > 5 AND S.ArticleName LIKE '%s%' GROUP BY S.MachineName, S.ShiftStartTime, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(S.ArticleName, '.', ''), '-', ' '), '16s SL', '16SL'),'20s SL', '20SL' ),'21s SL', '21SL'),'32s SL', '32SL' ),'40s SL', '40SL' ), S.ShiftNumber, S.ArticleYarnCount_Count, S.ArticleYarnCount_Count * 0.5909, S.YarnCountTotal     ORDER BY S.MachineName select * from #temp1 where YarnCounts != 'INIT   12'`,
  //   DB: db,
  //   timeout: 50000,
  // });
  let promise1 = requestFetchusterwebservice(null, {
    SPName: "USP_GetThirtydaysProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT_MACHINEPRODUCTION", "Fromdate": "${fromdate}", "todate": "${todate}" }`,
  });

  let promises2 = requestFetch3(null, {
    SPName: "USP_GTQtyToProductionApp",
    // JSONData: { ReqType: "SELECT", Division_id, fromdate, todate },
    JSONData: { fromdate, todate },
    DB: "ALCSpinning_Live",
  });

  // let promise3 = fetcher.requestFetch3(null, {
  //   SPName: "USP_tblMSpinningProduction",
  //   JSONData: { ReqType: "USTER_REALLISATION_SELECT", fromdate, todate },
  //   DB: "ALCSpinning_Live",
  // });
  let promise3 = requestFetch3(null, {
    SPName: "USP_tblMSpinningProduction",
    JSONData: { ReqType: "USTER_REPORT_SELECT", fromdate, todate },
    DB: "ALCSpinning_Live",
  });

  return Promise.all([promise1, promises2, promise3]).then((ress) => {
    fromdate = global.moment(fromdate);
    todate = global.moment(todate);

    let spinningprod = ress[2];
    let uspterprod = ress[0];

    let spinningMap = new Map();
    let proddata = [];
    if (ress[1].length > 0) {
      spinningprod.forEach((item) => {
        const key = `${item.ShiftNo}-${item.MachineNo}-${item.ProdDate}`;
        spinningMap.set(key, true);
        proddata.push(item);
      });
    }

    if (ress[0].length > 0) {
      let unmatcheddata = uspterprod.filter((usterItem) => {
        const key = `${usterItem.ShiftNo}-${usterItem.MachineNo}-${usterItem.ProdDate}`;
        return !spinningMap.has(key);
      });

      if (unmatcheddata.length > 0) {
        unmatcheddata.forEach((item) => {
          proddata.push(item);
        });
      }
    }

    let Production = proddata;

    let aggregatedData = Production.reduce((accumulator, item) => {
      const { YarnCounts, ShiftProdQty, ProdDate } = item;

      let found = false;
      for (let i = 0; i < accumulator.length; i++) {
        if (accumulator[i].Counts === YarnCounts && accumulator[i].ProdDate === ProdDate) {
          accumulator[i].ShiftProdQty += ShiftProdQty;
          found = true;
          break;
        }
      }
      if (!found) {
        accumulator.push({ ProdDate: ProdDate, Counts: YarnCounts, ShiftProdQty: ShiftProdQty });
      }

      return accumulator;
    }, []);
    let combinedArray = [];
    aggregatedData.forEach((item) => {
      let replaced_count = item.Counts.replace("16s SL", "16SL").replace("20s SL", "20SL").replace("21s SL", "21SL").replace("32s SL", "32SL").replace("KC", "Carded Compact").replace("KL", "Carded Lycra").replace("CL", "Combed Lycra").replace("CC", "Combed Compact").replace("K", "Carded").replace("CH", "Cheese").replace("CO", "Cone").replace("C ", "Combed ");
      combinedArray.push({ ProdDate: item.ProdDate, Counts: replaced_count, ShiftProdQty: item.ShiftProdQty });
    });

    const sortedproddata = combinedArray.sort((a, b) => {
      const dateA = new Date(a.ProdDate);
      const dateB = new Date(b.ProdDate);

      // Compare the Date objects
      return dateA - dateB;
    });

    let summarydata = sortedproddata;
    const laydowndata = ress[1];
    const currentdata = moment();
    const todate1 = moment(todate);
    let datelength;
    if (currentdata <= todate1) {
      datelength = currentdata.diff(fromdate, "day");
    } else {
      datelength = todate.diff(fromdate, "day");
    }

    let jsondata = [];
    if (summarydata) {
      for (let j = 0; j <= datelength; j++) {
        let newDate = fromdate.add(j > 0 ? 1 : 0, "days");
        let fdata = newDate.format("DD MMM yyyy");
        let cardedqty = 0;
        let combedqty = 0;
        let totalProd = 0;
        let totaltarget = 0;
        for (let i = 0; i < summarydata.length; i++) {
          if (summarydata[i].ProdDate === fdata && summarydata[i].Counts && summarydata[i].Counts.includes("Carded")) {
            cardedqty += summarydata[i].ShiftProdQty;
            totalProd += summarydata[i].ShiftProdQty;
            totaltarget += summarydata[i].ShiftTarget;
          } else if (summarydata[i].ProdDate === fdata && summarydata[i].Counts && summarydata[i].Counts.includes("Combed")) {
            combedqty += summarydata[i].ShiftProdQty;
            totalProd += summarydata[i].ShiftProdQty;
            totaltarget += summarydata[i].ShiftTarget;
          }
        }
        let cardeddata = (cardedqty / totalProd) * 84;
        let combeddata = (combedqty / totalProd) * 72;
        let raw_combed = (combedqty / 72) * 100;
        let raw_carded = (cardedqty / 84) * 100;

        // let Carded_real_proportion = cardedqty / totalProd;
        // let Combed_real_proportion = combedqty / totalProd;
        // let totalreallisationtarget = cardeddata + combeddata;
        // let reallisationcal = (totalProd / laydowndata.GTQty) * 100;
        jsondata.push({
          // total_target: totaltarget,
          date: fdata,
          total_prod: totalProd,
          laydown_qty: +parseFloat(laydowndata[j].GTQty).toFixed(1),
          // laydown_qty: Math.round(laydowndata[j].GTQty, )
          combed_prod: combedqty,
          carded_prod: cardedqty,
          combed_real: +parseFloat(combeddata).toFixed(2),
          carded_real: +parseFloat(cardeddata).toFixed(2),
          combed_real_const: 72,
          carded_real_const: 84,
          raw_combed_data: +parseFloat(raw_combed).toFixed(2),
          raw_carded_data: +parseFloat(raw_carded).toFixed(2),
          raw_cotton_total: +parseFloat(raw_combed + raw_carded).toFixed(2),
          difference: +parseFloat(laydowndata[j].GTQty - (raw_combed + raw_carded)).toFixed(2),
          // combed_real_proportion: Combed_real_proportion,
          // carded_real_proportion: Carded_real_proportion,
          // real_target: totalreallisationtarget,
          // real_actual: reallisationcal,
          // real_difference: totalreallisationtarget - reallisationcal,
        });
      }
    }

    console.log(jsondata);
    return res.json(jsondata);
  });
});

// ThirtydaysProduction for Report
router.post("/usterthirtydaysProduction", function (req, res, next) {
  // console.log("Request received on /ThirtydaysProduction");
  let json = req.body;
  let fromdate = json.fromdate;

  let promise1 = requestFetchusterwebservice(null, {
    SPName: "USP_GetThirtydaysProduction",
    DB: "USTER",
    JSONData: `{ "ReqType": "SELECT", "SubType": "SUMMARY_QTY_TO_PRODUCTION_REALLISATION", "Fromdate": "${fromdate}" }`,
  });

  return Promise.all([promise1]).then((ress) => {
    return res.json(ress);
  });
});

function getTarget(mc_target, date, shiftNo, mc_no) {
  for (var i = 1; i < mc_target.length; i++) {
    let row = [...mc_target[i]];
    let nextrow = [...mc_target[i + 1]];
    let next3rd_row = [...mc_target[i + 2]];

    if (row[0] === "") break;

    let t_date = global.moment(row[0]);
    let t_nextdate = global.moment(nextrow[0]);

    let val_date = global.moment(t_date).valueOf();
    let val_nextdate = global.moment(t_nextdate).valueOf();
    let val_orgdate = global.moment(date).valueOf();

    function chk_shift(tt_row, tt_shiftNo, val_date, val_orgdate) {
      let t_shiftNo = Number(tt_row[1]);
      if (t_shiftNo <= tt_shiftNo || val_date < val_orgdate) {
        return tt_row;
      }
    }

    let targetRow;
    if (nextrow[0] === "") {
      targetRow = row;
    } else if (val_date <= val_orgdate && val_nextdate > val_orgdate) {
      targetRow = chk_shift(row, shiftNo, val_date, val_orgdate);
    } else if (val_nextdate === val_orgdate) {
      let t_shiftNo = Number(nextrow[1]);
      if (t_shiftNo <= shiftNo) {
        let next3rd_row_date = global.moment(next3rd_row[0]);
        let val_next3rd_row_date = global.moment(next3rd_row_date).valueOf();

        if (val_next3rd_row_date === val_orgdate) {
          targetRow = chk_shift(next3rd_row, shiftNo);
        } else {
          targetRow = nextrow;
        }
      } else if (t_shiftNo > shiftNo) {
        targetRow = row;
      }
    }

    if (targetRow) {
      targetRow = change_target_arr(targetRow, date, shiftNo, mc_no);
      return targetRow;
    }
  }
}

function change_target_arr(trg, date, shiftno, mc_no) {
  trg[0] = date._d;
  trg[1] = shiftno;
  trg.unshift(mc_no);
  return trg;
}

// utility
function roundoff(d, r) {
    if (d) {
      let val = Math.round((d + Number.EPSILON) * (r ?? 100)) / (r ?? 100);
      return val;
    }
    return d;
  }

module.exports = { router };
