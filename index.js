const { DisconnectReason, useMultiFileAuthState } = require('baileys');
const makeWASocket = require('baileys').default;
const axios = require("axios");

const SHEET_URL = "https://script.google.com/macros/s/AKfycbwgl1DqyQ0R67BO2_2sLaGx0C12QIL6xkqH4SsxGD2px0IaTaJTLtQS_S9_DC1jdUocmA/exec"

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('connection.update', function(update, connection2) {
        let _a, _b;
        let connection = update.connection,
            lastDisconnect = update.lastDisconnect;

        if (connection == "close") {
            if (((_b = (_a = lastDisconnect.error) === null) || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode !== DisconnectReason.loggedOut) {
                startSock();
            }
        } else {
            console.log("Koneksi dihentikan sementara, sambil menunggu pesan masuk");
        }

        console.log("Koneksi terhubung kembali", update);
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        console.log(msg);
        if (!msg.key.fromMe && m.type === 'notify') {
            if (msg.message) {
                if (msg.message.conversation.includes('Format Laporan Harian') && !msg.message.conversation.includes('Berhasil dimasukkan')) {
                    console.log('Pesan berformat terdeteksi:\n');
                    console.log('Sender:' + msg.key.remoteJid);
                    console.log('Pesan: ', msg.message.conversation);

                    const text = msg.message.conversation;

                    // Splitting the text into lines
                    const lines = text.trim().split('\n');

                    // Extracting the relevant information
                    const data = {
                        tanggal: lines[1].trim().replace(/\*/g, ''),
                    };

                    let isKeteranganUangKeluar = false;
                    let keteranganUangKeluarList = [];
                    for (let i = 2; i < lines.length; i++) {
                        const line = lines[i].trim();
                    
                        if (isKeteranganUangKeluar) {
                            if (line.startsWith('1.') || line.startsWith('1 ') || line.startsWith('1')) {
                                for (let a = i; a < lines.length; a++) {
                                    const line2 = lines[a].trim();
                                    const [key, value] = line2.split(':');
                                    const formattedKey = key.trim().replace(/^\d+\./, '').toLowerCase();
                                    let formattedValue = '';
                                    if (value !== undefined) {
                                        formattedValue = value.trim().replace(/Rp\./g, '').replace(/\s/g, '').toLowerCase();
                                    }
                                    keteranganUangKeluarList.push([formattedKey, formattedValue]);
                                }
                                isKeteranganUangKeluar = false;
                                break;
                            }
                        } else if (line.includes(':')) {
                            const [key, value] = line.split(':');
                            const formattedKey = key.trim().replace(/\s/g, '').toLowerCase();
                            let formattedValue = '';
                            if (value !== undefined) {
                                formattedValue = value.trim().replace(/Rp\./g, '').replace(/\s/g, '').toLowerCase().replace(/pcs/g, '');
                            }
                    
                            if (formattedKey === 'keteranganuangkeluar') {
                                isKeteranganUangKeluar = true;
                                keteranganUangKeluarList = [];
                            } else {
                                // Remove square brackets [ and ]
                                formattedValue = formattedValue.replace(/\[|\]/g, '');
                                data[formattedKey] = formattedValue;
                            }
                        }
                    }
                    

                    if (keteranganUangKeluarList.length > 0) {
                        data['keteranganuangkeluar'] = keteranganUangKeluarList;
                    }

                    const emptyData = [];

                    const tanggal = data.tanggal ? data.tanggal : emptyData.push('Tanggal tidak ada');
                    const cabang = data.cabangtoko ? data.cabangtoko : emptyData.push("Cabang Toko tidak ada");

                    const barangTerjual = typeof data.jumlahbarangterjual === 'string' && data.jumlahbarangterjual !== '' && !isNaN(data.jumlahbarangterjual) && data.jumlahbarangterjual !== '0'
                      ? data.jumlahbarangterjual
                      : (data.jumlahbarangterjual === '0' ? '' : emptyData.push('Jumlah Barang Terjual tidak ada'));
                    
                    const retur = typeof data.jumlahretur === 'string' && data.jumlahretur !== '' && !isNaN(data.jumlahretur) && data.jumlahretur !== '0'
                      ? data.jumlahretur
                      : (data.jumlahretur === '0' ? '' : emptyData.push('Jumlah Retur tidak ada'));
                    
                    const barangMasuk = typeof data.jumlahbarangmasuk === 'string' && data.jumlahbarangmasuk !== '' && !isNaN(data.jumlahbarangmasuk) && data.jumlahbarangmasuk !== '0'
                      ? data.jumlahbarangmasuk
                      : (data.jumlahbarangmasuk === '0' ? '' : emptyData.push('Jumlah Barang Masuk tidak ada'));
                    
                    let keterangan = data.keteranganuangkeluar ? data.keteranganuangkeluar : emptyData.push("Keterangan Uang Keluar tidak ada");
                    let keterangan_api = keterangan 
                    let keterangan_str =''

                    axios.get(`${SHEET_URL}`)
                    .then(async (response) => {
                        const dataCategory = response.data.data
               
                        const additionalCategory = {
                          'harian': 'Gaji',
                          'transfer': 'Kas',
                        }

                        console.log('data yang diterima:,\n' + dataCategory)

                        try{
                            keterangan = keterangan.map(([key, value]) => {
                                let words = key.trim().split(' ');
                                words = words.filter(([key, value]) => value !== '');
                                let type = words.length > 1 ? words.shift() : words[0];
                                let ta = type
                                let data = type.toLowerCase() == 'harian' ? 'Harian ' + words.join(' ') : words.join(' ');
                                type = additionalCategory[type] ? additionalCategory[type] : (dataCategory.find(item => item.toLowerCase() === type) ? dataCategory.find(item => item.toLowerCase() === type) : 'Tidak Diketahui');
                                
                                if(type == "Tidak Diketahui"){
                                  emptyData.push(`Keterangan Uang Keluar: ${type} - ${data} mengalami masalah,\npastikan ada angka, kategori (spt: harian/gaji/pdam dll. didepannya)\ngunakan !kategori untuk melihat kategori\npastikan tidak ada baris yang kosong dan tidak ada []`);
                                }
                                
                                return {
                                  type,
                                  data,
                                  amount: value
                                };
                              });
                        }catch (err){
                            await sock.sendMessage(msg.key.remoteJid, {
                                text: `Format Keterangan Salah`
                            });
                        }
                      
              

                        if(emptyData.length > 0){
                            await sock.sendMessage(msg.key.remoteJid, {
                                quotes: msg,
                                text: `Data Tidak Di input terjadi kesalahan.\n
Cabang: ${cabang}, Permasalahan:\n
${emptyData.join('\n')}`
                            });
                            return
                        }

                        console.log(data);
    // console.log(`${SHEET_URL}?tanggal=${tanggal}&cabang=${cabang}&barangTerjual=${barangTerjual == '' ? '' : barangTerjual}&retur=${retur == '' ? '' : retur}&barangMasuk=${barangMasuk == '' ? '' : barangMasuk}&keterangan=${keterangan_api}`)
                        axios.post(`${SHEET_URL}?tanggal=${tanggal}&cabang=${cabang}&barangTerjual=${barangTerjual == '' ? '' : barangTerjual}&retur=${retur == '' ? '' : retur}&barangMasuk=${barangMasuk == '' ? '' : barangMasuk}&keterangan=${keterangan_api}`)
                        .then(async (response) => {
                            console.log('response google spreadsheet:\n', response.data);
                            if(response.data.success){
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `Berhasil dimasukkan, Cabang: ${cabang}\nFormat Laporan Harian\nTanggal: ${tanggal}\nCabang Toko: ${cabang}\nOmset: Rp.${data.omset}\nUang Keluar: Rp.${data.uangkeluar}\nUang Sisa: Rp.${data.uangsisa}\nJumlah Barang Terjual: ${barangTerjual == '' ? '0' : barangTerjual} PCS\nRetur: ${retur == '' ? '0' : retur} pcs\nBarang Masuk: ${barangMasuk == '' ? '0' : barangMasuk} pcs\nKeterangan Uang Keluar:\n${keterangan_api.map(([name, value]) => `${name}: Rp.${value}`).join('\n')}`
                                });
                            }else{
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `Terjadi kesalahan input data, silahkan cek manual untuk typo atau semacamnya`
                                });
                            }
                        });
                    });

                } else if(msg.message.conversation.includes('!kategori')) {
                    console.log('Pesan permintaan kategori terdeteksi:\n');
                    axios.get(`${SHEET_URL}`)
                    .then(async (response) => {
                        const dataCategory = response.data.data
                        if(response.data.success){
                            await sock.sendMessage(msg.key.remoteJid, {
                                text: `Kategori:\n ${dataCategory.join(',')}`
                            });
                        }else{
                            await sock.sendMessage(msg.key.remoteJid, {
                                text: `Terjadi kesalahan input data, silahkan cek manual untuk typo atau semacamnya`
                            });
                        }
                    });
                } else if(msg.message.conversation.includes('!format')){
                    console.log('Pesan permintaan format terdeteksi:\n'); 
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `Format Laporan Harian \nTanggal: [tanggal] \nCabang Toko : [cabang] \nOmset : Rp.[nominal] \nUang Keluar :Rp.[nominal] \nUang Sisa :Rp.[nominal] \nJumlah Barang terjual : [nominal] PCS \nJumlah Retur: [nominal] PCS \nJumlah Barang Masuk: [nominal] PCS \nKeterangan Uang Keluar : \n1. [kategori] [keterangan]:Rp.[nominal] \n2. [kategori] [keterangan]:Rp.[nominal] \n3. [kategori] [keterangan]:Rp.[nominal] \n`
                    });  
                } else if(msg.message.conversation.includes('!menu')) {
                    console.log('Pesan permintaan lihat menu robot terdeteksi:\n');
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `Menu:\n !menu = untuk menampilkan menu\n !kategori = untuk menampilkan kategori\n !format = untuk menampilkan format`
                    });
                } 
            }
        }

    });
};

startSock();
