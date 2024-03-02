const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const diff = require("diff");

const url = "https://imax.ucicinemas.it/";
const scrapedDataFolderPath = "scraped-data";
const updatesFolderPath = "differences-data";

async function getHTML() {
  const { data: html } = await axios.get(url);
  return html;
}

function getMovieScript(input, startStr, endStr) {
  let startIndex = input.indexOf(startStr);
  let endIndex = input.indexOf(endStr, startIndex + startStr.length);

  return startIndex !== -1 && endIndex !== -1 && startIndex < endIndex
    ? input.substring(startIndex + startStr.length, endIndex)
    : null;
}

function getNewFilmSchema(days) {
  const outputList = [];

  for (const cinemaKey in days) {
    const eventsList = days[cinemaKey];
    const cinemaName = cinemaKey
      .replace("_", " ")
      .replace("-", " ")
      .replace(/\d+/g, "")
      .trim()
      .replace(/(?:^|\s)\S/g, function (a) {
        return a.toUpperCase();
      })
      .replace(/\b(\w)/g, function (match) {
        return match.toUpperCase();
      })
      .replace(/-(\w)/g, function (match, group1) {
        return ` ${group1.toUpperCase()}`;
      });

    for (const event of eventsList) {
      const date = event.date;

      for (const timeInfo of event.events) {
        const movieTitle = timeInfo.movieTitle;

        for (const time of timeInfo.times) {
          outputList.push({
            movieTitle: movieTitle,
            date: date,
            time: time.time || "N/A",
            cinemaName: cinemaName || "N/A",
          });
        }
      }
    }
  }
  return outputList;
}

function saveToFile(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function compareLatestTwoFiles(scrapedDataFolderPath) {
  const scrapedDataFiles = fs.readdirSync(scrapedDataFolderPath);
  const sortedFiles = scrapedDataFiles
    .map((filename) => ({
      name: filename,
      time: fs.statSync(path.join(scrapedDataFolderPath, filename)).birthtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  const [latestFile, penultimateFile] = sortedFiles.slice(0, 2);

  if (latestFile && penultimateFile) {
    const latestFilePath = path.join(scrapedDataFolderPath, latestFile.name);
    const penultimateFilePath = path.join(
      scrapedDataFolderPath,
      penultimateFile.name
    );

    const latestData = fs.existsSync(latestFilePath)
      ? JSON.parse(fs.readFileSync(latestFilePath))
      : [];
    const penultimateData = fs.existsSync(penultimateFilePath)
      ? JSON.parse(fs.readFileSync(penultimateFilePath))
      : [];

    const differences = diff.diffArrays(penultimateData, latestData, {
      comparator: (a, b) => a.movieTitle === b.movieTitle,
    });

    console.log("Comparing:", penultimateFilePath, "and", latestFilePath);

    if (differences.some((part) => part.added || part.removed)) {
      console.log("Differences detected.");
      saveDifferencesToFile(differences, updatesFolderPath);
    } else {
      console.log("No differences found.");
    }
  } else {
    console.log("Not enough files for comparison.");
  }
}

function saveDifferencesToFile(differences, updatesFolderPath) {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\./g, "-");
  const differencesFilePath = path.join(
    updatesFolderPath,
    `differences_${timestamp}.json`
  );

  const filteredDifferences = differences.filter(
    (part) => part.added || part.removed
  );

  fs.writeFileSync(
    differencesFilePath,
    JSON.stringify(filteredDifferences, null, 2)
  );
  console.log("Differences saved to:", differencesFilePath);
}

/* Execution script */

if (!fs.existsSync(scrapedDataFolderPath)) {
  fs.mkdirSync(scrapedDataFolderPath);
}
if (!fs.existsSync(updatesFolderPath)) {
  fs.mkdirSync(updatesFolderPath);
}

const timestamp = new Date()
  .toISOString()
  .replace(/:/g, "-")
  .replace(/\./g, "-");
const newScrapedDataFilePath = path.join(
  scrapedDataFolderPath,
  `scraped-data_${timestamp}.json`
);

getHTML().then((res) => {
  const $ = cheerio.load(res, { xmlMode: false });
  const script = $("script").text();
  const moviesScript = getMovieScript(
    script,
    "moment.locale('it')",
    "function gotToBuyPage(pid) {"
  );

  eval(moviesScript);

  const TIMES = times,
    MOVIES = movies,
    DAYS = days;

  const newFilmSchema = getNewFilmSchema(DAYS);

  saveToFile(newFilmSchema, newScrapedDataFilePath);
  console.log("New data saved to:", newScrapedDataFilePath);

  compareLatestTwoFiles(scrapedDataFolderPath);
});
