import DingocoinLogo from "../assets/img/dingocoin.png";
import * as React from "react";
import { Button, Col, Container, Form, Navbar, Row } from "react-bootstrap";
import browser from "webextension-polyfill";
import "./styles.scss";
import dingocoin from "../dingocoin";
import provider from "../provider";

const satoshiToLocaleString = (x: any) => {
  const isNegative = BigInt(x) < 0n;
  if (isNegative) {
    x = -x;
  }
  const integer = (BigInt(x) / 100000000n).toString();
  const decimal = (BigInt(x) % 100000000n).toString().padStart(8, "0");
  return (
    (isNegative ? "-" : "") +
    `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal}`
  );
};

const SignTransaction: React.FC = () => {
  const [id, setId] = React.useState(null);
  const [origin, setOrigin] = React.useState(null);

  const [transactionNonWalletVins, setTransactionNonWalletVins] =
    React.useState(null);
  const [transactionWalletVins, setTransactionWalletVins] =
    React.useState(null);
  const [transactionVouts, setTransactionVouts] = React.useState(null);
  const [transactionData, setTransactionData] = React.useState(null);
  const [transactionFee, setTransactionFee] = React.useState(null);
  const [transactionFeeSufficient, setTransactionFeeSufficient] =
    React.useState(null);

  const [account, setAccount] = React.useState(undefined);
  React.useEffect(() => {
    (async () => {
      const active = await browser.storage.sync.get("activeAccount");
      let activeAccount = null;
      if ("activeAccount" in active) {
        activeAccount = active.activeAccount;
        setAccount(activeAccount);
      } else {
        setAccount(null);
      }

      const q = new URLSearchParams(window.location.search);
      setId(parseInt(q.get("id")));
      setOrigin(q.get("origin"));

      // Process vins.
      const nonWalletVinsRaw = q.get("vins").split(",");
      const nonWalletVins = [];
      if (q.get("vins") !== "") {
        for (let i = 0; i < nonWalletVinsRaw.length; i += 2) {
          nonWalletVins.push({
            txid: nonWalletVinsRaw[i],
            vout: parseInt(nonWalletVinsRaw[i + 1]),
            amount: 0n, // Non wallet vins do not participate toward fee.
          });
        }
      }
      setTransactionNonWalletVins(nonWalletVins);

      // Process vouts.
      const voutsRaw = q.get("vouts").split(",");
      const vouts = [];
      let opReturn: Buffer = null;
      if (q.get("vouts") !== "") {
        for (let i = 0; i < voutsRaw.length; i += 2) {
          if (voutsRaw[i] === "data") {
            opReturn = Buffer.from(voutsRaw[i + 1], "hex");
          } else {
            vouts.push({
              address: voutsRaw[i],
              amount: BigInt(voutsRaw[i + 1]),
            });
          }
        }
      }
      setTransactionVouts(vouts);
      setTransactionData(opReturn);
      if (activeAccount !== null) {
        const walletVins = (await provider.getUtxos(activeAccount.address)).map(
          (x: any) => {
            return { txid: x.txid, vout: x.vout, amount: BigInt(x.amount) };
          }
        );
        setTransactionWalletVins(walletVins);

        // Simulate fee.
        let signedTx = null;
        let fee = dingocoin.FEE_RATE;
        while (true) {
          const testAccountPrivKey = dingocoin.randomPrivateKey();
          const testAccountAddress = dingocoin.toAddress(testAccountPrivKey);
          const test = dingocoin.createSignedRawTransaction(
            nonWalletVins.concat(walletVins),
            vouts,
            opReturn,
            fee,
            testAccountAddress,
            testAccountPrivKey
          );
          const requiredFee =
            BigInt(Math.ceil((test.tx.length / 2 + 100) / 1000)) *
            dingocoin.FEE_RATE; // 100 bytes allowance for errors.
          if (fee >= requiredFee) {
            signedTx = test;
            break;
          }
          fee += dingocoin.FEE_RATE;
        }
        setTransactionFee(fee);
        setTransactionFeeSufficient(signedTx.balanceAmount >= 0n);
      }
    })();
  }, []);

  const [signPassword, setSignPassword] = React.useState("");
  const [signPasswordError, setSignPasswordError] = React.useState(null);
  React.useEffect(() => {
    if (signPassword.length === 0) {
      setSignPasswordError("Account password required.");
    } else {
      setSignPasswordError(null);
    }
  }, [signPassword]);

  const onApprove = (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    const privKey = dingocoin.decrypt(account, signPassword);
    const address = dingocoin.toAddress(privKey);
    if (address !== account.address) {
      setSignPasswordError("Incorrect account password.");
      return;
    }

    const signedTx = dingocoin.createSignedRawTransaction(
      transactionNonWalletVins.concat(transactionWalletVins),
      transactionVouts,
      transactionData,
      transactionFee,
      account.address,
      privKey
    );

    onEnd(null, signedTx.tx);
  };

  const onEnd = (err: any, res: any) => {
    const bc_bg_popup = new BroadcastChannel("dingo_bg_popup_" + id);
    if (err === undefined || err === null) {
      bc_bg_popup.postMessage({ result: res });
    } else {
      bc_bg_popup.postMessage({ error: err });
    }
    window.close();
  };

  return (
    <div>
      <Navbar className="navbar" bg="dark" expand="lg" sticky="top">
        <Container fluid>
          <Navbar.Brand href="#home" className="navbar-brand">
            <img alt="" src={DingocoinLogo} />
          </Navbar.Brand>
          <span>DINGOCOIN</span>
          {/*Lmao f this shit I give up someone please hire a web designer*/}
          <img
            style={{ visibility: "hidden", width: "2rem" }}
            alt=""
            src={DingocoinLogo}
          />
        </Container>
      </Navbar>
      <Container id="signdata" className="justify-content-md-center">
        <h1>Sign Transaction</h1>
        <div>
          <p>
            <span style={{ lineBreak: "anywhere" }}>
              <b>{origin}</b>
            </span>
            <br />
            wants to sign a transaction.
            <br />
          </p>
          <hr />
          <Container className="tx-details">
            {transactionFeeSufficient !== null && (
              <Row>
                <Col>
                  <div style={{ textAlign: "left" }}>
                    <span className="align-middle">Current Balance</span>
                  </div>
                </Col>
                <Col xs="auto">
                  <div className="ml-auto">
                    {
                      <samp
                        className="align-middle"
                        style={{
                          color: transactionFeeSufficient ? "auto" : "red",
                        }}
                      >
                        {satoshiToLocaleString(
                          transactionWalletVins.reduce(
                            (a: any, b: any) => a + b.amount,
                            0n
                          )
                        )}
                      </samp>
                    }
                  </div>
                </Col>
              </Row>
            )}
            {transactionVouts !== null && (
              <Row>
                <Col>
                  <div style={{ textAlign: "left" }}>
                    <span className="align-middle">Transaction</span>
                  </div>
                </Col>
                <Col xs="auto">
                  <div className="ml-auto">
                    <samp className="align-middle">
                      <b>
                        {satoshiToLocaleString(
                          transactionVouts.reduce(
                            (a: any, b: any) => a + b.amount,
                            0n
                          )
                        )}
                      </b>
                    </samp>
                  </div>
                </Col>
              </Row>
            )}
            {transactionFee !== null && (
              <Row>
                <Col>
                  <div style={{ textAlign: "left" }}>
                    <span className="align-middle">Fee</span>
                  </div>
                </Col>
                <Col xs="auto">
                  <div className="ml-auto">
                    <samp className="align-middle">
                      {satoshiToLocaleString(transactionFee)}
                    </samp>
                  </div>
                </Col>
              </Row>
            )}
          </Container>
          <hr />
          {account !== undefined && account === null && (
            <div>
              <p>To continue, select an active account in your wallet.</p>
              <Button
                className="mx-2"
                variant="outline-dark"
                onClick={() => onEnd(null, "No active account")}
              >
                Close
              </Button>
            </div>
          )}
          {account !== undefined &&
            account !== null &&
            transactionFeeSufficient === false && (
              <div>
                <p style={{ color: "red" }}>Insufficient balance in wallet.</p>
                <Button
                  className="mx-2"
                  variant="outline-dark"
                  onClick={() => onEnd(null, "No active account")}
                >
                  Close
                </Button>
              </div>
            )}
          {account !== undefined &&
            account !== null &&
            transactionFeeSufficient === true && (
              <div>
                <p>
                  Sign with account
                  {account.label !== null && (
                    <span style={{ lineBreak: "anywhere" }}>
                      : <b>{account.label}</b>
                    </span>
                  )}
                  <br />
                  <span style={{ lineBreak: "anywhere", fontSize: "0.75rem" }}>
                    <b>{account.address}</b>
                  </span>
                  ?
                </p>
                <Form noValidate onSubmit={onApprove}>
                  <Form.Group className="mb-3">
                    <Form.Control
                      placeholder="Account password"
                      className="mt-2 mb-2"
                      type="password"
                      value={signPassword}
                      onChange={(e) => setSignPassword(e.target.value)}
                      isInvalid={signPasswordError !== null}
                      autoFocus
                    />
                    {signPasswordError && (
                      <Form.Label className="input-error">
                        {signPasswordError}
                      </Form.Label>
                    )}
                  </Form.Group>
                  <Button
                    className="mx-2"
                    variant="primary"
                    type="submit"
                    disabled={signPasswordError !== null}
                  >
                    Approve
                  </Button>
                  <Button
                    className="mx-2"
                    variant="outline-dark"
                    onClick={() => onEnd("User rejected request", null)}
                  >
                    Reject
                  </Button>
                </Form>
              </div>
            )}
        </div>
      </Container>
    </div>
  );
};

export default SignTransaction;
